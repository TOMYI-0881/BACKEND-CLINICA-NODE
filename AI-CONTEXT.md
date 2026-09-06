# Contexto de IA — decisiones de diseño y desviaciones

Este proyecto se construyó con Claude Code, fase por fase, siguiendo `prompt-maestro-backend-clinica.md`
como instrucción completa inicial. Este documento explica **por qué** el código quedó así en los
puntos donde se desvía del documento original, corrige un error real que contenía, o llena un vacío
que el documento dejaba sin definir. La regla seguida en todo momento (instrucción 11 del prompt
maestro) fue: señalar explícitamente cualquier desviación antes de aplicarla, nunca cambiar el
diseño en silencio.

## Errores reales corregidos en el documento original

### `tsrange` → `tstzrange` (Fase 2)

La sección 5 define la restricción `EXCLUDE` de `appointments` usando `tsrange(start_time, end_time)`,
pero `start_time`/`end_time` son `TIMESTAMPTZ`. `tsrange` es la función de rango de PostgreSQL para
`timestamp` (sin zona horaria); para `timestamptz` la función correcta es `tstzrange`. Postgres
rechaza la migración con `function tsrange(timestamp with time zone, timestamp with time zone) does
not exist` (código `42883`). Corregido a `tstzrange`, que preserva exactamente la misma semántica de
bounds `[start, end)` que pedía el documento.

### Deadlocks bajo restricciones `EXCLUDE` en alta concurrencia (Fase 2/6)

El documento asume que una violación de `EXCLUDE` siempre se manifiesta como `exclusion_violation`
(`23P01`). En la práctica, bajo concurrencia real (8-25 requests verdaderamente simultáneas), Postgres
puede resolver la contención vía su detector de deadlocks (`deadlock_timeout` ~1s por ciclo),
devolviendo `deadlock_detected` (`40P01`) para algunas de las transacciones perdedoras — es
comportamiento documentado de PostgreSQL con índices GiST, no un bug de la aplicación. Se agregó
reintento con backoff exponencial y jitter amplio para estos códigos transitorios (nunca para el
`23P01` real, que sí se mapea a `ConflictError` sin reintentar). El primer backoff lineal probado
sincronizaba a los perdedores en el mismo ciclo de deadlock y producía cascadas de hasta 80+
segundos en los tests; el backoff exponencial con jitter los desincroniza y bajó el mismo test a
~6 segundos, estable en múltiples corridas.

## Vacíos del documento, llenados con una decisión explícita

- **Horario de atención y duración de slots** (`GetAvailability`, Fase 3): el documento no define
  el horario de la clínica ni la granularidad de los turnos. Se asumió 09:00–18:00 UTC con slots de
  30 minutos (constante única en `domain/entities/Availability.ts`, fácil de ajustar).
- **Payload `room-updated`**: la sección 7 exige `{ doctorId, availability: Slot[] }`, lo que implica
  recalcular disponibilidad tras cada creación/cancelación de cita. Se extrajo `computeFreeSlots`
  como lógica de dominio pura, reutilizada tanto por `GetAvailability` como por la difusión desde
  `CreateAppointment`/`CancelAppointment`.

## Puertos y casos de uso agregados (no listados en la sección 4, pero necesarios)

La sección 4 enumera 6 puertos y un conjunto de casos de uso que no cubren toda la superficie que la
sección 6 (contratos de API) exige. Cada adición sigue el mismo patrón que los puertos existentes:

- **`DoctorRepository`**: sin él, `POST/GET /doctors` tendría que importar `pg` directo desde el caso
  de uso, violando Clean Architecture (sección 3).
- **`PasswordHasher` / `TokenService`**: la sección 4 sí nombra `BcryptAdapter.ts`/`JwtAdapter.ts`
  como adaptadores de infraestructura — un adaptador solo tiene sentido si implementa una interfaz de
  dominio. Sin estos puertos, `RegisterUser`/`LoginUser` no podrían testearse con "puertos mockeados"
  como exige el criterio de aceptación de la Fase 3.
- **`ForbiddenError` (403)**: un solo `UnauthorizedError` no puede representar tanto "sin JWT" (401)
  como "rol incorrecto" (403), ambos exigidos explícitamente por la sección 6.
- **`CreateDoctor`/`ListDoctors`, `ListMyAppointments`**: casos de uso de responsabilidad única que
  la sección 4 no lista, pero que los endpoints de la sección 6 requieren.

## Regla de negocio agregada durante la Fase 6 (a pedido explícito)

Al construir el test de carga de check-in de la Fase 6, se detectó una tensión real: el criterio de
aceptación pide "exactamente 1 respuesta 201 y el resto 409" también para el check-in concurrente,
pero el diseño de la cola (secciones 9.2/9.7) está pensado para que los check-ins concurrentes
**siempre tengan éxito** (números secuenciales únicos vía reintento) — no para rechazar walk-ins
legítimos. Se preguntó explícitamente y se resolvió así: el escenario real que el criterio buscaba
probar es el **doble check-in de la misma cita** (doble click, reintento de red), no el check-in de
pacientes distintos. Se agregó `idx_turns_one_per_appointment` (índice único parcial sobre
`turns(appointment_id) WHERE appointment_id IS NOT NULL`), con el mismo patrón que las demás
invariantes (`no_overlapping_appointments`, `idx_turns_one_in_progress`): la base de datos es la
fuente de verdad. `PostgresQueueRepository.checkIn()` distingue esta violación por nombre de
constraint de la colisión de numeración (que sigue reintentando). Se agregaron tests separados para
ambos comportamientos: doble check-in de una cita → 1 éxito + resto conflicto; walk-ins legítimos
concurrentes → todos exitosos con números únicos. La sección 9.7 y el modelo de datos (sección 5) de
`prompt-maestro-backend-clinica.md` se actualizaron con esta regla para que quede trazada igual que
el resto de las decisiones.

## Decisiones de infraestructura sin impacto en el diseño de dominio

- **`.dockerignore`**: faltaba, así que `COPY . .` en el Dockerfile sobrescribía el `node_modules`
  Linux recién instalado con el `node_modules` del host (Windows), rompiendo el binario nativo de
  `bcrypt` (`ERR_DLOPEN_FAILED`). Agregado.
- **`express.json()` no es global**: se aplica por sub-router (`auth`, `doctors`, `appointments`,
  `queues`), nunca sobre todo `/api`, porque `/webhooks/github` necesita el `Buffer` crudo del body
  para verificar la firma HMAC — `express.json()` global lo hubiera consumido antes de tiempo.
- **`/health` y `/api-docs` fuera de `/api`**: son endpoints de infraestructura/operabilidad
  (healthcheck de Docker, documentación), no recursos versionables de negocio.
- **Puertos externos de Docker Compose** (`3001`, `5434` en vez de `3000`, `5432`): la máquina de
  desarrollo ya tenía otro proyecto y una instalación nativa de Postgres usando esos puertos. La
  comunicación entre contenedores siempre usa los puertos internos; solo cambia el mapeo hacia el
  host. Ver README para instrucciones de revertirlo si no aplica en otra máquina.

## Extensión post-entrega: CORS y rol DOCTOR

Después de entregar las 7 fases del documento maestro, el usuario pidió dos cosas más, fuera
del alcance original: (1) un archivo de referencia para que un agente de frontend consuma la
API, y (2) un rol `DOCTOR` con gestión completa de doctores por `ADMIN`, un flujo de
aprobación para las cancelaciones que pide un doctor, y notificaciones por email además de
Discord.

### CORS (gap real encontrado, no pedido explícitamente)

Al preparar la guía de frontend se detectó que el backend no tenía **ningún** middleware CORS
— un frontend en otro origen (`localhost:5173`, etc.) sería bloqueado por el navegador antes
de llegar a la API. Se agregó `cors` con `CORS_ORIGIN` (default `*`, seguro porque la API usa
Bearer tokens, no cookies — no hay CSRF que mitigar con `credentials`). Se señaló al usuario
antes de aplicar el cambio.

### Diseño del rol DOCTOR

- **Los doctores pasan a ser usuarios del sistema**: `doctors.user_id` (NOT NULL, UNIQUE) →
  `users.id`. `POST /doctors` ahora crea la cuenta (`users`, rol `DOCTOR`) y el perfil
  (`doctors`) **en una sola transacción** (`PostgresDoctorRepository.createDoctorAccount`),
  mismo patrón que las transacciones multi-tabla ya usadas en `PostgresQueueRepository`.
- **Cancelación de un DOCTOR = pedido, no acción directa**: un DOCTOR nunca cancela una cita
  el mismo; `POST /appointments/:id/request-cancellation` crea un `CancellationRequest`
  (`pending`) y mueve la cita a un estado nuevo, `CANCELLATION_REQUESTED`. Un ADMIN la
  aprueba (`CANCELLED` + notifica al paciente) o rechaza (vuelve a `CONFIRMED`).
- **Corrección de correctitud real**: el `EXCLUDE` de no-solapamiento originalmente solo
  protegía `status = 'CONFIRMED'`. Si `CANCELLATION_REQUESTED` no se agregaba a ese `WHERE`,
  el horario quedaría libre para que otro paciente lo reservara mientras el pedido todavía
  está pendiente de revisión — y si el ADMIN lo rechaza después, quedarían dos personas con el
  mismo turno. Se corrigió el `WHERE` para incluir ambos estados. Verificado con un test de
  integración dedicado (pedir cancelación → intentar reservar el mismo horario con otro
  paciente → `409`).
- **"Borrar" un doctor = soft-delete + cascada, nunca DELETE real**: las FK de
  `appointments`/`turns` hacia `doctors` son `ON DELETE NO ACTION`, así que un DELETE real
  rompería contra cualquier doctor con historial. `DELETE /doctors/:id` marca
  `is_active = false` y cancela en cascada las citas futuras `CONFIRMED` de ese doctor,
  notificando a cada paciente afectado (email + Discord, ambos no bloqueantes).
- **`EmailService` es un puerto nuevo, distinto de `NotificationService`**: `NotificationService`
  (Discord) solo maneja un string; un email necesita destinatario y asunto. Adaptador real:
  `NodemailerEmailService` (Gmail SMTP por defecto, credenciales del usuario vía
  `EMAIL_USER`/`EMAIL_PASSWORD`), con el mismo no-op-si-vacío que ya tenía
  `DiscordNotificationService`. Testeado contra un servidor SMTP local falso (`smtp-server`),
  mismo patrón que el mock HTTP de Discord.
- **Ownership de la cola para DOCTOR**: `requireRole` (basado solo en el rol) no alcanza para
  "ADMIN, o el DOCTOR dueño de este `:doctorId`" — depende de un dato del recurso, no solo del
  rol del usuario. Se agregó `requireAdminOrOwnDoctor` (con un parámetro para roles extra
  siempre permitidos, usado para que `PATIENT` siga pudiendo auto-registrarse en el check-in).

### Bugs reales encontrados durante la implementación

- **`appointments.status` era `varchar(20)`, y `'CANCELLATION_REQUESTED'` tiene 23
  caracteres.** El `CHECK` constraint se actualizó sin ampliar el tipo de columna —
  Postgres no valida longitud en un `CHECK`, así que el error (`value too long for type
  character varying(20)`) solo apareció al correr el `UPDATE` real en el test de integración,
  no en la migración en sí. Se agregó una migración aparte ampliando la columna a
  `varchar(30)`.
- **El índice único de "un pedido pendiente por cita" nunca es la primera línea de defensa
  bajo concurrencia real**: el `UPDATE appointments ... WHERE status = 'CONFIRMED'` dentro de
  `create()` ya serializa la carrera antes de llegar al `INSERT` en
  `appointment_cancellation_requests` — la primera transacción en confirmar deja a las demás
  sin filas afectadas, así que rechaza con `ValidationError` (estado inválido), no con
  `ConflictError` (índice único). El índice sigue siendo la garantía real para cualquier otro
  camino de escritura (probado aparte, con `INSERT` crudo que bypasea el guard, igual que la
  Fase 2 probaba `idx_turns_doctor_date_number` sin pasar por `checkIn()`).
- **Interrupción de infraestructura durante el desarrollo**: en un punto de esta sesión los 3
  contenedores de Docker aparecieron caídos (`Exited 137`, señal de un reinicio de Docker
  Desktop o suspensión de la máquina) en medio de una corrida de tests, produciendo errores
  de conexión genéricos (`AggregateError`) en vez de fallos de test reales. Se identificó
  revisando `docker compose ps`, y se resolvió con `docker compose up -d` (el volumen de
  Postgres persistió, no hizo falta re-migrar).

### Gap encontrado por el agente de frontend: DOCTOR no tenía forma de descubrir el `id` de sus propias citas

Al integrar el flujo de "pedir cancelación" (`POST /appointments/:id/request-cancellation`),
el agente de frontend reportó que no existía ningún endpoint para que un `DOCTOR` supiera qué
`appointmentId` usar — `GET /appointments/mine` solo devolvía las citas del `PATIENT`
autenticado; `GET /appointments` (todas) era exclusivo de `ADMIN`. La opción correcta no era
resolverlo en el frontend (pegar el id a mano, o limitarlo a lo visible en la cola del día) —
era cerrar el gap en el backend. Se extendió `ListMyAppointments`/`GET /appointments/mine`
para que, según el rol del que llama, devuelva las citas por `patientId` (`PATIENT`, sin
cambios) o por `doctorId` (`DOCTOR`, nuevo — resuelto internamente vía
`DoctorRepository.findByUserId`). Se agregó `AppointmentRepository.findByDoctor` (mismo patrón
que `findByPatient`) y un test e2e que reproduce el flujo completo tal como lo necesita el
frontend: el doctor lista sus citas, toma el `id` de la respuesta, y lo usa para pedir la
cancelación. Queda documentado como gap todavía abierto (no resuelto porque no se pidió):
un `DOCTOR` tampoco tiene forma de descubrir su propio `Doctor.id` (el que usan las rutas
`/queues/:doctorId/*`) sin filtrar `GET /doctors` a mano — ver sección 3 de
`FRONTEND_AGENT_GUIDE.md`.

## Prompts clave

El desarrollo completo se hizo en una sola sesión continua a partir de un único prompt del usuario:
*"quiero que mires el archivo @prompt-maestro-backend-clinica.md y ejecutes las instrucciones
dadas"*. El propio documento maestro funcionó como especificación completa fase por fase (instrucción
11: "trabaja una fase a la vez... resume qué se hizo y qué tests la respaldan antes de continuar").
El único punto donde se pidió una decisión explícita al usuario fue la tensión de la Fase 6 descrita
arriba (interpretación del test de carga de check-in), resuelta con instrucciones puntuales del
usuario sobre la implementación exacta (índice único parcial, no reintento, y no perder cobertura del
caso de walk-ins legítimos).
