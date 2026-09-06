# Prompt maestro — Backend Sistema de Reservas Clínicas

> Documento de contexto para guiar a un agente de codificación (Claude Code u otro). Contiene el objetivo, la arquitectura, el modelo de datos, los contratos de API, las decisiones técnicas ya validadas y el plan de fases con criterios de aceptación. Úsalo como instrucción inicial completa, o pégalo por fases si el agente lo maneja mejor en partes.

## 1. Objetivo

Construir el **backend** (sin frontend por ahora) de un sistema de reservas de turnos médicos en una clínica. El requisito no negociable del proyecto es que **nunca debe permitirse una doble reserva** (superposición de horarios) para un mismo doctor, incluso bajo alta concurrencia (múltiples requests simultáneas al mismo horario).

Prioridad: calidad de arquitectura, robustez del control de concurrencia y cobertura de tests, por encima de velocidad de entrega.

## 2. Stack tecnológico

- **Runtime/lenguaje**: Node.js + TypeScript (modo estricto completo)
- **Framework HTTP**: Express (sin Nest, decisión explícita)
- **Base de datos**: PostgreSQL, con transacciones ACID y extensión `btree_gist`
- **Cache/locks**: Redis (`ioredis`)
- **Tiempo real**: WebSockets con la librería `ws`, montada sobre el mismo servidor HTTP
- **Notificaciones**: Webhook de Discord (doble propósito: eventos de negocio + eventos de CI/GitHub)
- **Auth**: `jsonwebtoken` + `bcrypt`
- **Migraciones**: `node-pg-migrate` (versionadas, nunca un script SQL suelto)
- **Validación de DTOs**: `zod`
- **Testing**: Jest + `supertest` (unit, integración contra Postgres real vía Docker, y e2e)
- **Logging**: `pino` (logging estructurado)
- **Documentación de API**: `swagger-jsdoc` + `swagger-ui-express`
- **Rate limiting**: `express-rate-limit`
- **Pool de conexiones**: `pg.Pool` nativo, instancia única compartida vía DI (nunca una conexión por request)
- **Calidad de código**: ESLint + Prettier configurados desde el inicio
- **Contenedores**: `docker-compose.yml` con `postgres`, `redis`, `api`, todos con `healthcheck`

## 3. Principios de arquitectura: Clean Architecture (puertos y adaptadores)

El dominio y los casos de uso **nunca** importan directamente `pg`, `ioredis`, `ws` ni `fetch`. Toda tecnología externa entra como un **adaptador** que implementa una **interfaz (puerto)** definida en el dominio. Esto permite:

- Testear casos de uso con mocks de los puertos, sin levantar infraestructura real.
- Cambiar de tecnología (ej. Discord por Slack) sin tocar la lógica de negocio.
- Que un fallo en una pieza no crítica (WebSocket, Discord) nunca rompa el flujo de negocio central (crear/cancelar una reserva).

## 4. Estructura de carpetas completa

```
src/
  domain/
    entities/              User.ts, Doctor.ts, Appointment.ts, Turn.ts
    ports/                 AppointmentRepository.ts, UserRepository.ts, QueueRepository.ts, LockService.ts, EventPublisher.ts, NotificationService.ts
    errors/                CustomError.ts, ConflictError.ts, NotFoundError.ts, ValidationError.ts, UnauthorizedError.ts
  application/
    use-cases/             RegisterUser.ts, LoginUser.ts, CreateAppointment.ts, CancelAppointment.ts, GetAvailability.ts, ListAppointments.ts, CheckInPatient.ts, CallNextTurn.ts, SkipTurn.ts, RecallCurrentTurn.ts, GetQueueStatus.ts
    dtos/                  RegisterUserDto.ts, LoginUserDto.ts, CreateAppointmentDto.ts, CancelAppointmentDto.ts, GetAvailabilityDto.ts, CheckInDto.ts (todos validados con zod)
  infrastructure/
    database/postgres/     PostgresAppointmentRepository.ts, PostgresUserRepository.ts, PostgresQueueRepository.ts, migrations/ (node-pg-migrate)
    cache/redis/           RedisLockService.ts
    realtime/ws/           WebSocketServer.ts (singleton, solo conexiones locales), RedisPubSubEventPublisher.ts (implementa EventPublisher), RedisSubscriber.ts (relay entre instancias), protocol.ts
    notifications/discord/ DiscordNotificationService.ts
    webhooks/github/       GithubSignatureMiddleware.ts, GithubEventParser.ts
    auth/                  JwtAdapter.ts, BcryptAdapter.ts
  presentation/
    http/
      controllers/         auth.controller.ts, appointments.controller.ts, doctors.controller.ts, queues.controller.ts, webhooks.controller.ts, health.controller.ts
      middlewares/          auth.middleware.ts, roles.middleware.ts, errorHandler.ts, rateLimit.middleware.ts
      routes/
    websocket/             message-router.ts
  config/
    env.ts                 Variables de entorno tipadas y validadas
    di.ts                  Composición de dependencias (inyección manual por constructor)
test/
  unit/
  integration/
  e2e/
```

## 5. Modelo de datos completo

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('PATIENT', 'ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  specialty VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  patient_id UUID NOT NULL REFERENCES users(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- Nucleo critico: nunca permitir dos citas CONFIRMED del mismo doctor con horarios que se superpongan.
-- tsrange usa por defecto bounds '[)' (inicio inclusivo, fin exclusivo), por lo que citas
-- consecutivas (ej. 10:00-11:00 y 11:00-12:00) son validas y no chocan.
ALTER TABLE appointments
ADD CONSTRAINT no_overlapping_appointments
EXCLUDE USING gist (
  doctor_id WITH =,
  tsrange(start_time, end_time) WITH &&
) WHERE (status = 'CONFIRMED');

CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, start_time);

-- Cola de espera en vivo (check-in del dia, distinta del agendamiento anticipado).
-- appointment_id es nullable: soporta tanto pacientes con cita reservada como walk-ins.
CREATE TABLE turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  appointment_id UUID REFERENCES appointments(id),
  queue_date DATE NOT NULL,
  number INTEGER NOT NULL,
  patient_name VARCHAR(255) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'preferente')),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in-progress', 'done', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_turns_doctor_date_number ON turns(doctor_id, queue_date, number);

-- Nucleo critico de la cola: nunca dos turnos in-progress del mismo doctor al mismo tiempo,
-- garantizado a nivel de base de datos igual que el EXCLUDE de appointments (indice unico parcial).
CREATE UNIQUE INDEX idx_turns_one_in_progress ON turns(doctor_id, queue_date) WHERE (status = 'in-progress');

CREATE INDEX idx_turns_doctor_date_status ON turns(doctor_id, queue_date, status);

-- Agregado en la Fase 6 (ver seccion 9.7): una cita solo puede generar un turno de cola.
-- Sin esto, un doble check-in (doble click, reintento de red) crearia dos turnos para
-- la misma cita. Mismo patron que las dos constraints anteriores: la BD es la fuente
-- de verdad, no una validacion en el caso de uso.
CREATE UNIQUE INDEX idx_turns_one_per_appointment ON turns(appointment_id) WHERE appointment_id IS NOT NULL;
```

Todas las columnas de fecha/hora son `TIMESTAMPTZ` (excepto `queue_date`, que es `DATE`) y se manejan en UTC en toda la aplicación.

## 6. Contratos de la API REST

Prefijo base: `/api`.

| Método | Ruta | Auth | Rol | Descripción |
|---|---|---|---|---|
| POST | `/auth/register` | No | - | Registra un usuario nuevo (rol `PATIENT` por defecto) |
| POST | `/auth/login` | No | - | Autentica y retorna JWT |
| GET | `/doctors` | No | - | Lista los doctores disponibles |
| POST | `/doctors` | JWT | ADMIN | Crea un doctor |
| GET | `/appointments/availability` | No | - | Query params `doctorId`, `date`. Devuelve huecos libres del día |
| POST | `/appointments` | JWT | PATIENT | Crea una reserva para el usuario autenticado |
| GET | `/appointments/mine` | JWT | PATIENT | Lista las reservas propias |
| GET | `/appointments` | JWT | ADMIN | Lista todas las reservas (paginado: `page`, `limit`) |
| DELETE | `/appointments/:id` | JWT | PATIENT (dueño) o ADMIN | Cancela una reserva |
| POST | `/queues/:doctorId/check-in` | JWT | PATIENT o ADMIN | Registra un turno en la cola del día (`appointmentId` opcional, `priority` opcional) |
| GET | `/queues/:doctorId` | No | - | Estado actual de la cola (query param `date`, default hoy): turno en curso + lista de espera |
| POST | `/queues/:doctorId/next` | JWT | ADMIN | Marca el turno en curso como `done` y promueve el siguiente |
| POST | `/queues/:doctorId/skip` | JWT | ADMIN | Marca el turno en curso como `skipped` y promueve el siguiente |
| POST | `/queues/:doctorId/call` | JWT | ADMIN | Re-anuncia el turno en curso (sin cambiar estado, solo difunde por WebSocket) |
| POST | `/webhooks/github` | Firma HMAC (`x-hub-signature-256`) | - | Recibe eventos de GitHub y notifica a Discord |
| GET | `/health` | No | - | Verifica conectividad real a Postgres y Redis |
| GET | `/api-docs` | No | - | Documentación Swagger UI |

Reglas de autorización:
- `DELETE /appointments/:id`: si el usuario autenticado es `PATIENT`, solo puede cancelar una reserva cuyo `patient_id` coincida con su propio `id`. Si es `ADMIN`, puede cancelar cualquiera.
- `GET /appointments`: solo `ADMIN`. Un `PATIENT` que intente acceder debe recibir `403`, no `401`.

## 7. Protocolo de mensajes WebSocket

Endpoint de conexión: `ws://host/ws`. Convención de mensaje: `{ type: string, payload?: object }`.

**Decisión de diseño (difiere de los documentos de referencia originales):** en las especificaciones de WebSockets para clínica y de colas de tickets que usamos como inspiración, el cliente enviaba comandos de mutación (`add-turn`, `next-turn`) directo por WebSocket. Aquí **todas las mutaciones van por REST** (sección 6), reutilizando el mismo middleware de auth/roles y quedando testeables con `supertest`. El WebSocket se usa **exclusivamente para difundir** cambios de estado a quien esté escuchando — nunca para recibirlos.

| Dirección | type | payload | Efecto |
|---|---|---|---|
| Cliente → Servidor | `join-doctor-room` | `{ doctorId: string }` | Suscribe la conexión a las actualizaciones de ese doctor (disponibilidad y cola) |
| Cliente → Servidor | `leave-doctor-room` | `{ doctorId: string }` | Cancela la suscripción |
| Servidor → Cliente | `room-updated` | `{ doctorId: string, availability: Slot[] }` | Se emite tras crear o cancelar una reserva de ese doctor |
| Servidor → Cliente | `queue-updated` | `{ doctorId: string, date: string, currentTurn: Turn \| null, waiting: Turn[] }` | Se emite tras check-in, `next`, `skip` o `call` sobre la cola de ese doctor |
| Servidor → Cliente | `error` | `{ message: string }` | Mensaje mal formado o `doctorId` inexistente |

El puerto `EventPublisher` se define de forma genérica, no con un método por feature, para que agregar un tercer tipo de evento en el futuro no requiera tocar el dominio:

```ts
interface EventPublisher {
  publish(channel: string, event: { type: string; payload: unknown }): Promise<void>;
}
```

El canal es `doctor:{doctorId}` para ambos tipos de evento. El `WebSocketEventPublisher` es el único adaptador que conoce el formato final del mensaje; los casos de uso solo llaman `events.publish('doctor:' + doctorId, { type: 'queue-updated', payload })`.

## 8. Variables de entorno (`.env.template`)

```
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/clinica
REDIS_URL=redis://localhost:6379
JWT_SECRET=change_me_in_production
JWT_EXPIRES_IN=1d
DISCORD_WEBHOOK_URL=
GITHUB_WEBHOOK_SECRET=
LOG_LEVEL=info
```

`env.ts` debe validar todas estas variables al arranque con tipado explícito (fallar rápido si falta alguna obligatoria).

## 9. Decisiones técnicas ya validadas (no las repitas ni las cuestiones sin razón)

### 9.1 PostgreSQL — el núcleo crítico

- Usar `tsrange` sin especificar bounds manualmente: el default `'[)'` evita falsos positivos en citas consecutivas.
- Capturar el código de error `23P01` (`exclusion_violation`) en el repositorio y mapearlo a `ConflictError` del dominio.
- No usar Prisma ni TypeORM para la tabla `appointments`: ninguno modela bien `EXCLUDE` constraints. Usar `pg` (node-postgres) directo con SQL explícito.

### 9.2 Redis — optimización, nunca la garantía de correctitud

- El `EXCLUDE` constraint de Postgres **ya** garantiza que nunca habrá doble reserva por sí solo. Redis solo reduce el overhead de transacciones que compiten por el mismo índice.
- Granularidad del lock de reservas: `lock:doctor:{id}:{fecha}:{startTime redondeado a bloques de 15 min}` — nunca bloquear el día completo del doctor.
- Segundo uso del mismo `LockService`, distinta clave: numeración correlativa de turnos de la cola de espera, `lock:queue:{doctorId}:{fecha}`, para evitar que dos check-in simultáneos calculen el mismo `number` antes de insertar. Igual que con las reservas, el índice único `idx_turns_doctor_date_number` es la garantía real; el lock solo evita colisiones innecesarias que forzarían un reintento.
- TTL del lock: ~10 segundos (margen seguro sobre el tiempo real de la operación).
- **Política fail-open obligatoria**: si Redis no responde, el sistema debe seguir aceptando reservas y check-ins apoyado solo en las restricciones de Postgres (reintentando el cálculo del número si el índice único rechaza un duplicado). Debe estar cubierto por un test de integración que apague Redis y confirme que ambos flujos se siguen procesando.

### 9.3 WebSocket — tiempo real, escalable horizontalmente

- `WebSocketServer` (singleton) mantiene **solo las conexiones locales** de su propio proceso: `Map<channel, Set<WebSocket>>`, montado con `new WebSocketServer({ server })` sobre el mismo servidor HTTP de Express (`ws` maneja el `upgrade` internamente).
- **El puerto `EventPublisher` no lo implementa `WebSocketServer` directamente.** Lo implementa `RedisPubSubEventPublisher`: `publish(channel, event)` hace `redis.publish(channel, JSON.stringify(event))`. Esto es indiferente a cuántas instancias de la API estén corriendo.
- `RedisSubscriber` es un proceso separado (una **segunda conexión** de `ioredis` — en modo suscripción una conexión no puede ejecutar otros comandos) que escucha el patrón `doctor:*` y, al recibir un mensaje, se lo reenvía al `WebSocketServer` **local** de esa misma instancia para difundirlo a sus propios clientes conectados.
- Resultado: un evento publicado por el caso de uso ejecutándose en la instancia A llega también a los clientes WebSocket conectados a la instancia B, C, etc. — el sistema escala horizontalmente sin cambiar una línea de dominio ni de casos de uso, porque estos solo conocen la interfaz `EventPublisher`.
- Limpiar conexiones cerradas del `Map` local al evento `close`.

### 9.4 Discord — doble propósito, mismo adaptador

`DiscordNotificationService implements NotificationService` con un único método `notify(message: string)`, reutilizado por dos flujos independientes:

1. **Eventos de negocio**: los casos de uso llaman `notifier.notify(...)` en creación, cancelación y doble-reserva bloqueada.
2. **Eventos de CI/repo**: el endpoint `POST /webhooks/github`, protegido por `GithubSignatureMiddleware` (verificación HMAC-SHA256 del header `x-hub-signature-256` con `crypto.timingSafeEqual`, nunca `===`), recibe eventos de GitHub y llama al mismo `DiscordNotificationService`.
3. El middleware de firma se aplica **solo** a esa ruta específica, nunca de forma global con `app.use()`.
4. Toda llamada a `notifier.notify()` desde un caso de uso debe ir en `.catch(logError)`, nunca bloqueante hacia la respuesta HTTP.

### 9.5 Autenticación

- Passwords hasheadas con `bcrypt` (adaptador propio, nunca llamar la librería directo desde el caso de uso).
- JWT firmado con `JWT_SECRET`, payload mínimo: `{ userId, role }`.
- El middleware de auth rellena `req.user` tipado (nunca `req.body.user`).

### 9.6 Caso de uso central de referencia

```ts
class CreateAppointment {
  constructor(
    private repo: AppointmentRepository,
    private lock: LockService,
    private events: EventPublisher,
    private notifier: NotificationService
  ) {}

  async execute(dto: CreateAppointmentDto) {
    const slotKey = `lock:doctor:${dto.doctorId}:${dto.date}:${roundTo15min(dto.startTime)}`;
    const acquired = await this.lock.acquire(slotKey, { ttlMs: 10_000 }).catch(() => false);

    try {
      const appointment = await this.repo.save(dto);

      const channel = `doctor:${dto.doctorId}`;
      this.events.publish(channel, { type: 'room-updated', payload: { doctorId: dto.doctorId } }).catch(logError);
      this.notifier.notify(`Nueva reserva: doctor ${dto.doctorId}, ${dto.date} ${dto.startTime}`).catch(logError);

      return appointment;
    } catch (err) {
      if (isExclusionViolation(err)) {
        this.notifier.notify(`Intento de doble reserva bloqueado: doctor ${dto.doctorId}, ${dto.date}`).catch(logError);
        throw new ConflictError('Horario ya reservado');
      }
      throw err;
    } finally {
      if (acquired) await this.lock.release(slotKey).catch(logError);
    }
  }
}
```

### 9.7 Cola de espera en vivo (check-in del día)

Concepto separado del agendamiento anticipado: gestiona el **orden de atención** de quienes ya están físicamente en la clínica un día dado, con o sin cita previa.

- **Lógica de dominio pura**: la clase `TurnQueue` (o funciones puras equivalentes) vive en `domain/entities/Turn.ts` y no conoce Postgres, Redis ni WebSocket — mismo principio que `rooms.ts` en el documento de referencia de WebSockets de clínica. Esto la hace testeable con datos en memoria, sin infraestructura.
- **Regla de prioridad al promover el siguiente turno**: los turnos con `priority = 'preferente'` se atienden antes que los `normal`; dentro de la misma prioridad, orden FIFO por `number`. Esta regla debe estar cubierta por un test unitario explícito (ej. 3 turnos normales y 1 preferente creado después: el preferente debe promoverse primero).
- **`appointment_id` opcional**: si el check-in referencia una cita (`appointmentId`), el caso de uso `CheckInPatient` valida que esa cita exista, pertenezca a ese doctor y esté `CONFIRMED` antes de crear el turno. Si no se referencia (walk-in), solo requiere `patientName`.
- **Invariante de un solo turno `in-progress`**: garantizada por `idx_turns_one_in_progress` (índice único parcial), con el mismo criterio de diseño que el `EXCLUDE` de `appointments`: la base de datos es la fuente de verdad, no el código de aplicación.
- **Invariante de un solo turno por cita** *(agregado en la Fase 6, a partir del criterio de aceptación de esa fase)*: una cita solo puede generar un turno de cola — un doble check-in de la misma cita (doble click, reintento de red) nunca debe crear dos turnos. Garantizada por `idx_turns_one_per_appointment` (índice único parcial sobre `appointment_id`, ver sección 5), mismo patrón que las dos invariantes anteriores: `PostgresQueueRepository.checkIn()` captura la violación de este índice específico (distinguiéndola por nombre de constraint de la violación de `idx_turns_doctor_date_number`, que sí debe reintentarse) y la mapea a `ConflictError`, sin reintentar — el intento nunca va a dejar de chocar. Importante: esta regla es ortogonal al fail-open de checkIn() para walk-ins/check-ins sin cita repetida entre sí, que deben seguir teniendo éxito con números únicos vía reintento (sección 9.2); solo el doble check-in de la MISMA cita se rechaza.
- **Persistencia obligatoria**: a diferencia de las implementaciones de referencia (que mantenían el estado de la cola solo en memoria del proceso y lo perdían al reiniciar), aquí los turnos se persisten en Postgres desde el día 1 — es un requisito de "buen proyecto", no una mejora opcional.
- `CallNextTurn` y `SkipTurn` deben ejecutarse dentro de una transacción: marcar el turno actual (`done` o `skipped`) y promover el siguiente es una sola operación atómica, para que un fallo a mitad de camino nunca deje la cola sin turno `in-progress` ni con dos.

### 9.8 Escalabilidad horizontal y eficiencia

Decisiones que hacen que el backend pueda correr en **múltiples instancias** detrás de un load balancer sin cambios adicionales:

- **Sin estado en el proceso**: la autenticación es JWT (sin sesiones en memoria ni sticky sessions necesarias); el estado de las salas WebSocket es local por instancia, pero el relay de Redis Pub/Sub (sección 9.3) lo sincroniza entre todas.
- **Pool de conexiones a Postgres**: una única instancia de `pg.Pool` compartida por toda la aplicación (inyectada vía `config/di.ts`), configurada con `max` acorde a la carga esperada (ej. 20 conexiones por instancia) y `idleTimeoutMillis` para liberar conexiones ociosas. Nunca crear un `Client` nuevo por request.
- **Rate limiting**: `express-rate-limit` en dos niveles — uno estricto en `POST /auth/login` (ej. 5 intentos/minuto por IP, previene fuerza bruta) y uno más permisivo a nivel global de `/api` (protección básica contra abuso, sin penalizar tráfico legítimo).
- **Índices ya cubren los patrones de acceso más frecuentes**: `idx_appointments_doctor_date` para `GetAvailability` y `ListAppointments`, `idx_turns_doctor_date_status` para `GetQueueStatus` — evita table scans bajo carga.
- **Los locks de Redis nunca son de espera bloqueante**: `acquire()` debe fallar rápido (no reintentar en loop) si la clave ya está tomada; el flujo continúa hacia Postgres de todas formas (ver 9.2), así que el sistema nunca acumula requests esperando un lock.

## 10. Plan de fases con criterios de aceptación

Sigue las fases **en orden**. No avances a la siguiente sin cumplir los criterios de aceptación de la actual.

### Fase 0 — Fundaciones
- TypeScript estricto completo, ESLint + Prettier, Jest con `test/unit`, `test/integration`, `test/e2e`.
- `docker-compose.yml` con `postgres`, `redis`, `api`, todos con `healthcheck`, y `api` con `depends_on: condition: service_healthy`.
- `pg.Pool` único configurado en `config/di.ts` con `max`/`idleTimeoutMillis`; middleware de rate limiting montado globalmente y con regla estricta adicional en `/auth/login`.
- **Criterio de aceptación**: `docker-compose up` levanta los 3 servicios sin error; `npm run lint` pasa limpio; superar el límite de `/auth/login` responde `429`.

### Fase 1 — Dominio
- Entidades `User`, `Doctor`, `Appointment` con invariantes validadas en el constructor (ej. `endTime > startTime`).
- `Turn.ts` con la lógica pura de la cola: agregar turno, promover siguiente respetando prioridad, saltar turno. Sin ninguna dependencia de infraestructura.
- Los 6 puertos documentados con JSDoc (incluye `QueueRepository`).
- Jerarquía de `CustomError`.
- **Criterio de aceptación**: tests unitarios de entidades pasan, sin ninguna dependencia externa importada en `domain/`, incluyendo el test de la regla de prioridad de la cola.

### Fase 2 — Base de datos versionada y probada
- Migraciones con `node-pg-migrate` para las 4 tablas de la sección 5 (incluye `turns`), una migración por tabla/cambio.
- Script de seed mínimo con 3-5 doctores de ejemplo (necesario para poder probar reservas y check-ins).
- `PostgresAppointmentRepository`, `PostgresUserRepository` y `PostgresQueueRepository` con `pg` puro.
- **Criterio de aceptación**: test de integración real contra Postgres (vía Docker) que lanza inserciones concurrentes con `Promise.allSettled` y confirma que exactamente una tiene éxito, tanto para reservas solapadas como para dos check-in simultáneos calculando el mismo número de turno.

### Fase 3 — Casos de uso
- Todos los casos de uso de la sección 4, incluyendo `CheckInPatient`, `CallNextTurn`, `SkipTurn`, `RecallCurrentTurn`, `GetQueueStatus`, con DTOs validados por `zod`.
- **Criterio de aceptación**: tests unitarios con los puertos mockeados cubriendo: registro/login, reserva exitosa, conflicto de horario, fallo de Redis no rompe el flujo, fallo de notificación no rompe el flujo, reserva exactamente en el límite, un `PATIENT` no puede cancelar la reserva de otro, un check-in con `appointmentId` de otro doctor es rechazado, y la promoción de siguiente turno respeta la prioridad `preferente`.

### Fase 4 — Adaptadores de infraestructura
- `RedisLockService` con granularidad de 15 min para reservas y clave separada para numeración de turnos, ambos con fail-open testeado (el `acquire()` falla rápido, sin reintentos bloqueantes).
- `RedisPubSubEventPublisher` (implementa `EventPublisher`) y `RedisSubscriber` como relay, gestión de salas locales y limpieza de conexiones cerradas en `WebSocketServer`.
- `DiscordNotificationService` con timeout configurado.
- `GithubSignatureMiddleware` con `crypto.timingSafeEqual`.
- `JwtAdapter` y `BcryptAdapter`.
- **Criterio de aceptación**: cada adaptador tiene sus propios tests de integración. Adicionalmente, un test de integración que levante **dos instancias** del `WebSocketServer` (dos procesos o dos puertos distintos) conectadas al mismo Redis, conecte un cliente a cada una, publique un evento desde la instancia A, y confirme que el cliente conectado a la instancia B lo recibe — esto prueba la escalabilidad horizontal real, no solo la declarada.

### Fase 5 — Presentación
- Todos los endpoints de la sección 6 (incluye `/queues/*`), con las reglas de autorización exactas descritas ahí.
- Middleware global de errores: mapea `CustomError` a código HTTP correcto, todo lo demás a 500 sin filtrar detalles internos.
- Composición de dependencias en `config/di.ts`.
- Documentación OpenAPI/Swagger de todos los endpoints.
- **Criterio de aceptación**: `GET /api-docs` sirve la documentación; un `PATIENT` que llama `GET /appointments` recibe `403`; un `PATIENT` que llama `POST /queues/:doctorId/next` recibe `403`; un request sin JWT a una ruta protegida recibe `401`.

### Fase 6 — Pruebas de extremo a extremo
- Test e2e completo con `supertest`: registrar usuario, autenticar, crear cita, intentar duplicarla, cancelarla, un admin listando todas las reservas, y el flujo completo de cola (check-in de 3 pacientes con distinta prioridad, `next`, verificar que el `preferente` se atendió antes que un `normal` creado primero).
- Script de carga de concurrencia (20-50 requests simultáneas) como test automatizado (`npm test`), aplicado tanto a la creación de reservas en el mismo horario como al check-in simultáneo en la misma cola.
- **Criterio de aceptación**: exactamente 1 respuesta `201` y el resto `409` en ambos tests de carga; ejecutable con un solo comando.

### Fase 7 — Observabilidad y documentación final
- Logging estructurado con `pino`.
- `GET /health` que verifica conectividad real a Postgres y Redis.
- README con arquitectura explicada, instrucciones de instalación y de cada tipo de test.
- Documento de contexto de IA explicando decisiones de diseño y prompts clave usados.
- **Criterio de aceptación**: un tercero puede clonar el repo, correr `docker-compose up`, y seguir el README para probar todo sin ayuda adicional.

## 11. Instrucciones de comportamiento para el agente

- Trabaja una fase a la vez. Al terminar cada fase, resume qué se hizo y qué tests la respaldan antes de continuar.
- Escribe los tests junto con el código, no como una tarea separada al final.
- Si una decisión de este documento entra en conflicto con una práctica que consideres mejor, señálalo explícitamente antes de desviarte — no cambies el diseño en silencio.
- No introduzcas MongoDB, Prisma ni TypeORM en ningún punto del proyecto.
- Todo el manejo de fechas/horas en el backend debe estar en UTC.
