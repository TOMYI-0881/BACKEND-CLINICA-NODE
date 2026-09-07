# Backend — Sistema de Reservas Clínicas

Backend de un sistema de reservas de turnos médicos. El requisito central del proyecto es
que **nunca se permita una doble reserva** (superposición de horarios) para un mismo doctor,
incluso bajo alta concurrencia — la garantía vive en la base de datos (constraint `EXCLUDE`
de PostgreSQL), no en el código de aplicación.

Incluye además una cola de espera en vivo (check-in del día, con prioridad `preferente`),
notificaciones por Discord y email, un webhook de GitHub, documentación OpenAPI y
actualizaciones en tiempo real por WebSocket que escalan horizontalmente vía Redis Pub/Sub.

Tres roles: `PATIENT` (agenda/cancela sus propias citas), `DOCTOR` (cuenta propia, pide
cancelar sus citas con motivo — sujeto a aprobación —, opera su propia cola) y `ADMIN`
(gestiona el catálogo de doctores, aprueba/rechaza cancelaciones, ve todo). Ver
**[`ENDPOINTS.md`](./ENDPOINTS.md)** para la referencia completa de la API y
**[`FRONTEND_AGENT_GUIDE.md`](./FRONTEND_AGENT_GUIDE.md)** si vas a construir un frontend
sobre este backend.

## 1. Arquitectura

Clean Architecture (puertos y adaptadores). El dominio y los casos de uso **nunca** importan
`pg`, `ioredis`, `ws`, `express` ni `fetch` directamente — toda tecnología externa entra
como un adaptador de infraestructura detrás de una interfaz (puerto) definida en el dominio.

```
src/
  domain/          Entidades, puertos (interfaces) y errores. Cero dependencias externas.
  application/     Casos de uso (orquestan puertos) y DTOs validados con zod.
  infrastructure/  Adaptadores concretos: Postgres, Redis, WebSocket, Discord, GitHub, JWT/Bcrypt.
  presentation/    Controladores, rutas, middlewares HTTP y el router de mensajes WebSocket.
  config/          env.ts (variables tipadas), di.ts (composition root), logger.ts, swagger.ts.
test/
  unit/            Casos de uso y entidades con puertos mockeados. No requiere Docker.
  integration/     Contra Postgres/Redis reales (Docker). Prueba las garantías de concurrencia.
  e2e/             Flujo HTTP completo con supertest, incluyendo los tests de carga.
```

**Por qué esto importa para la garantía de no-doble-reserva:** la tabla `appointments` tiene
una restricción `EXCLUDE USING gist (doctor_id WITH =, tstzrange(start_time, end_time) WITH &&)`
sobre las reservas `CONFIRMED`. Ningún código de aplicación puede violarla, ni siquiera bajo
una carrera de decenas de requests simultáneas — Postgres rechaza la segunda inserción
conflictiva de forma atómica. Redis solo se usa como *optimización* para reducir la cantidad
de transacciones que compiten por el mismo índice; si Redis cae, el sistema sigue funcionando
correctamente apoyado únicamente en las restricciones de Postgres (ver `test/integration/redis-lock.test.ts`
y los tests de fail-open en `test/unit/use-cases/CreateAppointment.test.ts` /
`CheckInPatient.test.ts`). La misma filosofía protege la cola de espera: un solo turno
`in-progress` por doctor (`idx_turns_one_in_progress`) y un solo turno por cita
(`idx_turns_one_per_appointment`) son índices únicos de Postgres, no validaciones de código.

## 2. Requisitos

- Docker y Docker Compose
- Node.js 20+ y npm (solo si vas a correr `npm run dev`/tests fuera de Docker)

## 3. Instalación y arranque

```bash
git clone <este-repo>
cd BACKEND-CLINICA-NODE
cp .env.template .env
npm install
docker compose up -d --build
```

Esto levanta 3 servicios con healthcheck (`api` espera a que `postgres` y `redis` estén
`healthy` antes de arrancar):

| Servicio | Puerto host | Puerto interno |
|---|---|---|
| `api` | `3001` | `3000` |
| `postgres` | `5434` | `5432` |
| `redis` | `6379` | `6379` |

> Los puertos externos (`3001`, `5434`) están corridos respecto de los "de libro" (`3000`,
> `5432`) porque en la máquina de desarrollo ya había otros procesos usándolos. Si en tu
> máquina están libres, podés cambiarlos de vuelta en `docker-compose.yml` sin tocar nada
> más — la comunicación entre contenedores usa siempre los puertos internos.

Verificá que todo esté arriba:

```bash
curl http://localhost:3001/health
# {"status":"ok","checks":{"postgres":true,"redis":true}}
```

### Migraciones y datos de ejemplo

Las migraciones ya corren sobre el volumen de Postgres la primera vez que lo usás desde
cero, pero si necesitás correrlas manualmente (por ejemplo, contra una base nueva) o cargar
los doctores de ejemplo:

```bash
# El .env por default apunta a localhost:5434 (el puerto host de postgres de arriba)
npm run migrate:up
npm run seed        # crea 5 doctores de ejemplo + la cuenta ADMIN, si todavia no existen
```

El seed crea, por ejemplo, `ana.fernandez@clinica.test` / `clinica123` (mismo password para
los 5 — ver la salida del comando para la lista completa) y `admin@clinica.test` / `admin123`.
No hay endpoint público para crear cuentas `ADMIN` (es intencional, ver `AI-CONTEXT.md`), pero
el seed la garantiza por defecto en cualquier entorno nuevo — no hace falta insertarla a mano.

### Documentación de la API

Con la API arriba: **http://localhost:3001/api-docs**

## 4. Correr los tests

Todos los tipos de test corren contra la infraestructura real levantada por
`docker compose up` (no hay mocks de Postgres/Redis en integración/e2e).

```bash
npm test              # unit + integration + e2e, un solo comando (~15s)
npm run test:unit     # solo unit (puertos mockeados, no requiere Docker)
npm run test:integration  # adaptadores + garantías de concurrencia contra Postgres/Redis reales
npm run test:e2e      # flujo HTTP completo + tests de carga (20-50 requests concurrentes)
```

`test:integration` y `test:e2e` truncan las tablas de negocio (`appointment_cancellation_requests`,
`turns`, `appointments`, `doctors`, `users`) antes de cada test — no los corras contra una
base con datos que te importe conservar.

### Cómo probar la garantía de no-doble-reserva

**Automatizado** (esto es lo que corre `npm run test:integration`):
`test/integration/appointment-concurrency.test.ts` lanza 8-20 requests `POST /appointments`
verdaderamente simultáneas (`Promise.allSettled`, sin await entre ellas) al **mismo horario
con el mismo doctor** desde pacientes distintos, contra Postgres real (no mocks) — y verifica
que exactamente una resuelve `201` y el resto `409`. Se repite variando el escenario: mismo
horario exacto, horarios que se superponen parcialmente, y horarios consecutivos que **no**
deben chocar (`10:00-11:00` y `11:00-12:00`, semántica `[inicio, fin)`). El mismo principio
está probado también para la cola de espera en vivo (`test/integration/queue-concurrency.test.ts`:
doble check-in de la misma cita, y nunca más de un turno `in-progress` por doctor).

**A mano**, con la API arriba (`docker compose up` o `npm run dev`), para verlo en vivo con
tus propios ojos en vez de leer el resultado de un test:

```bash
#!/usr/bin/env bash
# 4 pacientes distintos intentan reservar EL MISMO horario con el mismo doctor,
# al mismo tiempo. Se espera exactamente un 201 y el resto 409.
BASE=http://localhost:3001
DOCTOR_ID=$(curl -s $BASE/api/doctors | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
START="2027-01-01T10:00:00.000Z"
END="2027-01-01T10:30:00.000Z"

for i in $(seq 1 4); do
  EMAIL="carrera-$i-$RANDOM@test.com"
  curl -s -X POST $BASE/api/auth/register -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"test1234\",\"name\":\"Carrera $i\"}" > /dev/null
  TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"test1234\"}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
  ( curl -s -o /dev/null -w "Paciente $i -> %{http_code}\n" -X POST $BASE/api/appointments \
      -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"$START\",\"endTime\":\"$END\"}" ) &
done
wait
```

Salida esperada (el orden de las líneas puede variar, el resultado no) — **probado tal cual
está escrito arriba**, contra una API real:

```
Paciente 1 -> 201
Paciente 2 -> 409
Paciente 3 -> 409
Paciente 4 -> 409
```

> El script se queda deliberadamente en 4 pacientes (no más): `POST /auth/login` tiene un rate
> limit de 5 intentos/minuto por IP (sección 8 de `FRONTEND_AGENT_GUIDE.md`), y cada iteración
> hace un login. Si ya veniás probando el login manualmente y te quedan pocos intentos en la
> ventana del minuto, algún `409` esperado puede aparecer como `401` (el login individual de
> ese paciente fue rate-limiteado, no un fallo de la garantía de concurrencia) — esperá un
> minuto y volvé a correrlo si eso pasa. El test automatizado no tiene este problema porque
> crea los pacientes directo en la base, sin pasar por el endpoint de login.

Por qué esto es confiable bajo carga real (no solo "anduvo esta vez"): la garantía es la
constraint `EXCLUDE USING gist` de Postgres sobre `appointments` (sección 1), no un `if` de
aplicación con una ventana de carrera. Bajo concurrencia alta, Postgres puede resolver la
contención como `deadlock_detected` en vez de `exclusion_violation` para algunas de las
transacciones perdedoras — comportamiento documentado del motor con índices GiST, no un bug;
está manejado con reintento y backoff exponencial (ver la sección "Deadlocks bajo
restricciones EXCLUDE" en `AI-CONTEXT.md` para el detalle de por qué y cómo se ajustó).

## 5. Variables de entorno

Ver `.env.template`. Todas se validan al arranque (`config/env.ts`, con `zod`) — el proceso
falla rápido si falta alguna obligatoria.

| Variable | Descripción |
|---|---|
| `PORT` | Puerto HTTP interno del contenedor `api` |
| `DATABASE_URL` | Cadena de conexión de Postgres |
| `REDIS_URL` | Cadena de conexión de Redis |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Firma y expiración de los JWT |
| `DISCORD_WEBHOOK_URL` | Opcional — vacío desactiva las notificaciones (no-op, no rompe nada) |
| `GITHUB_WEBHOOK_SECRET` | Secreto HMAC para `POST /webhooks/github` |
| `LOG_LEVEL` | Nivel de `pino` (`info`, `debug`, `silent`, etc.) |
| `CORS_ORIGIN` | Opcional, default `*`. Origen(es) permitidos separados por coma (ej. `http://localhost:5173`) |
| `EMAIL_USER` / `EMAIL_PASSWORD` | Opcionales — vacíos desactivan el envío de emails (no-op). `EMAIL_USER` es la cuenta que envía (ej. un Gmail), `EMAIL_PASSWORD` una **contraseña de aplicación** (nunca la contraseña normal de la cuenta) |
| `EMAIL_FROM_NAME` | Opcional, default `Clinica`. Nombre que aparece como remitente |
| `EMAIL_HOST` / `EMAIL_PORT` | Opcionales. Si se omiten, se usa Gmail SMTP directamente; cargalos para usar otro proveedor SMTP |

## 6. WebSocket

Endpoint: `ws://localhost:3001/ws`. Todas las mutaciones van por REST — el WebSocket solo
sirve para suscribirse a actualizaciones y recibirlas.

```jsonc
// Cliente → Servidor
{ "type": "join-doctor-room", "payload": { "doctorId": "<uuid>" } }
{ "type": "leave-doctor-room", "payload": { "doctorId": "<uuid>" } }

// Servidor → Cliente
{ "type": "room-updated", "payload": { "doctorId": "...", "availability": [...] } }
{ "type": "queue-updated", "payload": { "doctorId": "...", "date": "...", "currentTurn": {...}, "waiting": [...] } }
{ "type": "error", "payload": { "message": "..." } }
```

Escala horizontalmente: cada instancia de la API mantiene solo sus conexiones WebSocket
locales, y un `RedisSubscriber` (conexión Redis dedicada) reenvía los eventos publicados por
cualquier instancia a los clientes conectados localmente. Verificado en
`test/integration/websocket-cross-instance.test.ts` con dos instancias reales en puertos
distintos.

## 7. Notas y decisiones de diseño

Este proyecto se construyó siguiendo `prompt-maestro-backend-clinica.md` fase por fase. Las
decisiones no triviales, correcciones a errores reales del documento original, y las pocas
desviaciones deliberadas (todas señaladas explícitamente en el momento en que aparecieron)
están documentadas en **[`AI-CONTEXT.md`](./AI-CONTEXT.md)**.
