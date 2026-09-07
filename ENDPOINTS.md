# Endpoints de la API

Documentación de referencia rápida de todos los endpoints. Para probarlos interactivamente
usá la documentación OpenAPI/Swagger servida en **`GET /api-docs`** con la API corriendo.

- **Base URL**: `http://localhost:3001` (puerto host configurado en `docker-compose.yml`)
- **Prefijo de recursos de negocio**: `/api` (`/health` y `/api-docs` quedan fuera del prefijo — ver `AI-CONTEXT.md`)
- **Auth**: JWT vía header `Authorization: Bearer <token>`, obtenido en `POST /api/auth/login`
- **Roles**: `PATIENT` (agenda y cancela sus propias citas), `DOCTOR` (pide cancelar sus propias
  citas con motivo, opera su propia cola), `ADMIN` (gestiona doctores, aprueba/rechaza
  cancelaciones, ve todas las reservas, opera cualquier cola)
- **Fechas/horas**: todas en UTC, formato ISO 8601

## Índice

| Método | Ruta                                                                                        | Auth       | Rol                             |
| ------ | ------------------------------------------------------------------------------------------- | ---------- | ------------------------------- |
| POST   | [`/api/auth/register`](#post-apiauthregister)                                               | No         | -                               |
| POST   | [`/api/auth/login`](#post-apiauthlogin)                                                     | No         | -                               |
| GET    | [`/api/auth/me`](#get-apiauthme)                                                            | JWT        | Cualquier rol                   |
| POST   | [`/api/auth/me/photo`](#post-apiauthmephoto)                                                | JWT        | Cualquier rol                   |
| DELETE | [`/api/auth/me/photo`](#delete-apiauthmephoto)                                              | JWT        | Cualquier rol                   |
| GET    | [`/api/doctors`](#get-apidoctors)                                                           | No         | -                               |
| POST   | [`/api/doctors`](#post-apidoctors)                                                          | JWT        | ADMIN                           |
| PATCH  | [`/api/doctors/:id`](#patch-apidoctorsid)                                                   | JWT        | ADMIN                           |
| DELETE | [`/api/doctors/:id`](#delete-apidoctorsid)                                                  | JWT        | ADMIN                           |
| POST   | [`/api/doctors/:id/reset-password`](#post-apidoctorsidreset-password)                       | JWT        | ADMIN                           |
| GET    | [`/api/appointments/availability`](#get-apiappointmentsavailability)                        | No         | -                               |
| POST   | [`/api/appointments`](#post-apiappointments)                                                | JWT        | PATIENT                         |
| GET    | [`/api/appointments/mine`](#get-apiappointmentsmine)                                        | JWT        | PATIENT o DOCTOR                |
| GET    | [`/api/appointments`](#get-apiappointments)                                                 | JWT        | ADMIN                           |
| DELETE | [`/api/appointments/:id`](#delete-apiappointmentsid)                                        | JWT        | PATIENT (dueño) o ADMIN         |
| POST   | [`/api/appointments/:id/request-cancellation`](#post-apiappointmentsidrequest-cancellation) | JWT        | DOCTOR (dueño)                  |
| GET    | [`/api/cancellation-requests`](#get-apicancellation-requests)                               | JWT        | ADMIN                           |
| POST   | [`/api/cancellation-requests/:id/approve`](#post-apicancellation-requestsidapprove)         | JWT        | ADMIN                           |
| POST   | [`/api/cancellation-requests/:id/reject`](#post-apicancellation-requestsidreject)           | JWT        | ADMIN                           |
| POST   | [`/api/queues/:doctorId/check-in`](#post-apiqueuesdoctoridcheck-in)                         | JWT        | PATIENT, ADMIN o DOCTOR (dueño) |
| GET    | [`/api/queues/:doctorId`](#get-apiqueuesdoctorid)                                           | No         | -                               |
| POST   | [`/api/queues/:doctorId/next`](#post-apiqueuesdoctoridnext)                                 | JWT        | ADMIN o DOCTOR (dueño)          |
| POST   | [`/api/queues/:doctorId/skip`](#post-apiqueuesdoctoridskip)                                 | JWT        | ADMIN o DOCTOR (dueño)          |
| POST   | [`/api/queues/:doctorId/call`](#post-apiqueuesdoctoridcall)                                 | JWT        | ADMIN o DOCTOR (dueño)          |
| GET    | [`/api/admin/dashboard/stats`](#get-apiadmindashboardstats)                                 | JWT        | ADMIN                           |
| POST   | [`/api/webhooks/github`](#post-apiwebhooksgithub)                                           | Firma HMAC | -                               |
| GET    | [`/health`](#get-health)                                                                    | No         | -                               |
| GET    | [`/api-docs`](#get-api-docs)                                                                | No         | -                               |
| WS     | [`/ws`](#websocket-ws)                                                                      | No         | -                               |

---

## Auth

### `POST /api/auth/register`

Registra un usuario nuevo. Siempre se crea con rol `PATIENT`.

**Rate limit**: sin límite estricto propio (solo el global de `/api`, 100 req/min).

**Body**

```json
{ "email": "paciente@test.com", "password": "secret123", "name": "Juan Perez" }
```

- `email`: string, formato email
- `password`: string, mínimo 6 caracteres
- `name`: string, entre 2 y 120 caracteres (se usa como nombre visible, ej. en la lista de
  espera de la cola en vivo)

**Respuestas**

| Status | Cuándo                                                   |
| ------ | -------------------------------------------------------- |
| 201    | Usuario creado. Devuelve el usuario (sin `passwordHash`) |
| 400    | Datos inválidos (zod)                                    |
| 409    | El email ya está registrado                              |

```json
// 201
{
  "id": "uuid",
  "email": "paciente@test.com",
  "role": "PATIENT",
  "createdAt": "2026-...",
  "photoUrl": null,
  "name": "Juan Perez"
}
```

### `POST /api/auth/login`

Autentica y devuelve un JWT.

**Rate limit**: **5 intentos/minuto por IP** (`loginRateLimiter`) — supera esto y responde 429.

**Body**

```json
{ "email": "paciente@test.com", "password": "secret123" }
```

**Respuestas**

| Status | Cuándo                 |
| ------ | ---------------------- |
| 200    | Login exitoso          |
| 401    | Credenciales inválidas |
| 429    | Demasiados intentos    |

```json
// 200
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "uuid",
    "email": "paciente@test.com",
    "role": "PATIENT",
    "createdAt": "2026-...",
    "photoUrl": null,
    "name": "Juan Perez"
  }
}
```

### `GET /api/auth/me`

Devuelve el perfil del usuario autenticado (mismo shape que el `user` de `POST /auth/login`).
Sirve para los 3 roles.

**Respuestas**: `200` perfil propio · `401` sin JWT

```json
// 200
{
  "id": "uuid",
  "email": "paciente@test.com",
  "role": "PATIENT",
  "createdAt": "2026-...",
  "photoUrl": "/uploads/photos/<archivo>.jpg",
  "name": "Juan Perez"
}
```

### `POST /api/auth/me/photo`

Sube (o reemplaza) la foto de perfil del usuario autenticado. **Una sola foto por usuario y
opcional**: subir una nueva borra la anterior del disco, nunca se acumulan varias. Si el
usuario es rol `DOCTOR`, la foto se replica automáticamente en su perfil público (aparece
también en `GET /api/doctors`). Sirve para los 3 roles.

**Body**: `multipart/form-data`, campo `photo` (archivo)

- Formatos aceptados: `jpg`, `png`, `webp`
- Tamaño máximo: `MAX_PHOTO_SIZE_MB` (default 2 MB)

**Respuestas**

| Status | Cuándo                                                            |
| ------ | ----------------------------------------------------------------- |
| 200    | Foto actualizada. Devuelve el usuario con el `photoUrl` nuevo     |
| 400    | Falta el archivo, formato no soportado, o excede el tamaño máximo |
| 401    | Sin JWT                                                           |

```json
// 200
{
  "id": "uuid",
  "email": "paciente@test.com",
  "role": "PATIENT",
  "createdAt": "2026-...",
  "photoUrl": "/uploads/photos/<archivo>.jpg",
  "name": "Juan Perez"
}
```

### `DELETE /api/auth/me/photo`

Quita la foto de perfil del usuario autenticado (y su réplica en `doctors` si es `DOCTOR`).
Borra también el archivo del disco. Sirve para los 3 roles.

**Respuestas**: `200` `{ "ok": true }` · `401` sin JWT

---

## Doctors

### `GET /api/doctors`

Lista los doctores **activos**. Público.

`name` es el nombre real, **sin** el prefijo "Dr./Dra." (el backend lo rechaza si se lo
mandan al crear/editar — ese prefijo es responsabilidad de presentación del frontend, que lo
antepone según `gender`). `photoUrl` se puebla automáticamente cuando ese doctor sube su foto
vía `POST /api/auth/me/photo` estando logueado con su propia cuenta — no hay una ruta separada
para setearla desde acá.

```json
// 200
[
  {
    "id": "uuid",
    "userId": "uuid",
    "name": "Ana Fernandez",
    "specialty": "Cardiologia",
    "gender": "female",
    "isActive": true,
    "createdAt": "2026-...",
    "photoUrl": null
  }
]
```

### `POST /api/doctors`

Crea un doctor **junto con su cuenta de usuario** (rol `DOCTOR`, para que pueda loguearse). Al
crearlo, `users.name` queda sincronizado con el `name` del doctor (antes quedaba `''`, por lo
que el doctor veía su email en vez de su nombre al loguear). Requiere JWT de rol **ADMIN**.

**Body**

```json
{
  "name": "Ana Fernandez",
  "specialty": "Cardiologia",
  "email": "ana@clinica.com",
  "password": "secret123",
  "gender": "female"
}
```

- `name`: **no debe incluir el prefijo** `Dr.`/`Dra.` — se rechaza con `400` si lo incluye
- `email`: formato email, único (409 si ya existe)
- `password`: mínimo 6 caracteres — el doctor la usa para loguearse en `POST /auth/login`
- `gender`: `"male"` o `"female"`, obligatorio (el frontend lo usa para elegir el prefijo de
  presentación)

**Respuestas**: `201` creado · `400` datos inválidos (falta `gender`, o `name` trae el prefijo) · `401` sin JWT · `403` rol distinto de ADMIN · `409` email ya registrado

### `PATCH /api/doctors/:id`

Edita `name`, `specialty` y/o `gender` (no toca la cuenta/email). Si cambia `name`, también
se re-sincroniza `users.name`. Requiere JWT de rol **ADMIN**.

**Body** (al menos uno de los tres)

```json
{ "name": "Nuevo Nombre", "specialty": "Nueva Especialidad", "gender": "male" }
```

- `name`, si se manda, tampoco puede incluir el prefijo `Dr.`/`Dra.` (mismo `400` que en create)

**Respuestas**: `200` actualizado · `400` datos inválidos · `404` doctor no encontrado

### `DELETE /api/doctors/:id`

**Soft-delete**: nunca borra la fila (rompería la integridad con citas/turnos históricos).
Marca al doctor `isActive: false`, y **cancela en cascada** todas sus citas futuras
`CONFIRMED`, notificando a cada paciente afectado por email y Discord. Requiere JWT de rol
**ADMIN**.

**Respuestas**: `200` doctor desactivado (con `isActive: false`) · `404` doctor no encontrado

### `POST /api/doctors/:id/reset-password`

Genera una contraseña temporal nueva para la cuenta del doctor y se la envía por email.
Requiere JWT de rol **ADMIN**.

**Respuestas**: `200` `{ "ok": true }` · `404` doctor no encontrado

---

## Appointments

Estados posibles de una cita: `CONFIRMED`, `CANCELLED`, `CANCELLATION_REQUESTED` (pedido de
cancelación de un DOCTOR, pendiente de aprobación de ADMIN) y `COMPLETED` (el paciente ya fue
atendido — se marca solo, cuando el turno vinculado se cierra como `done` en la cola, o de
forma perezosa al reservar una cita nueva si el horario de una cita activa anterior ya pasó).
Ninguna ruta permite setear `COMPLETED` directamente.

### `GET /api/appointments/availability`

Devuelve los huecos libres de 30 minutos de un doctor en un día (09:00–18:00 UTC), excluyendo
los ya ocupados por reservas `CONFIRMED` o `CANCELLATION_REQUESTED` (un pedido de cancelación
todavía no aprobado no libera el horario). Público.

**Query params**

- `doctorId` (requerido, UUID)
- `date` (requerido, `YYYY-MM-DD`)

```
GET /api/appointments/availability?doctorId=<uuid>&date=2026-05-01
```

```json
// 200
[{ "startTime": "2026-05-01T09:00:00.000Z", "endTime": "2026-05-01T09:30:00.000Z" }, ...]
```

### `POST /api/appointments`

Crea una reserva para el paciente autenticado. Requiere JWT de rol **PATIENT**.

**Body**

```json
{
  "doctorId": "uuid",
  "startTime": "2026-05-01T14:00:00.000Z",
  "endTime": "2026-05-01T14:30:00.000Z"
}
```

- `endTime` debe ser posterior a `startTime` (validado por zod y por la BD)

**Regla "una cita por médico por día calendario" (UTC)**: un paciente no puede tener más de
una cita `CONFIRMED`/`CANCELLATION_REQUESTED`/`COMPLETED` con el mismo médico el mismo día. Sí
puede tener citas `CONFIRMED` con el mismo médico en **días distintos**, y puede cambiar de
horario el mismo día cancelando y reservando de nuevo (antes de ser atendido). El mensaje de
error distingue si la cita en conflicto ya fue atendida o no:

**Respuestas**

| Status | Cuándo                                                                                   |
| ------ | ----------------------------------------------------------------------------------------- |
| 201    | Reserva creada                                                                             |
| 400    | Datos inválidos                                                                            |
| 401    | Sin JWT                                                                                    |
| 403    | Rol distinto de PATIENT                                                                    |
| 409    | `"Horario ya reservado"` / `"Ya tenes otra cita en ese horario con otro medico"` — superposición de horario con ese u otro médico |
| 409    | `"Ya tenés una cita con este doctor para ese día. Esperá a ser atendido."` — ya hay una cita activa (no atendida) ese mismo día con ese médico |
| 409    | `"Ya fuiste atendido por este doctor hoy. Podés reservar para otro día."` — la cita de ese día con ese médico ya está `COMPLETED` |

### `GET /api/appointments/mine`

Lista las reservas propias. Requiere JWT de rol **PATIENT** o **DOCTOR**:

- Si sos `PATIENT`, devuelve las citas donde sos el paciente.
- Si sos `DOCTOR`, devuelve las citas donde sos el doctor (útil para obtener el `id` de una
  cita propia antes de llamar `POST /appointments/:id/request-cancellation`). Cada item incluye
  además `patientEmail` (el email del paciente de esa cita), para poder identificarlo en la UI
  sin necesitar un endpoint de usuarios. **Solo para rol DOCTOR** — PATIENT y el listado de
  ADMIN (`GET /api/appointments`) no traen este campo.

```json
// 200 (rol DOCTOR)
[
  {
    "id": "uuid",
    "doctorId": "uuid",
    "patientId": "uuid",
    "startTime": "2026-...",
    "endTime": "2026-...",
    "status": "CONFIRMED",
    "createdAt": "2026-...",
    "patientEmail": "paciente@test.com"
  }
]
```

### `GET /api/appointments`

Lista **todas** las reservas, paginado. Requiere JWT de rol **ADMIN**.

**Query params**: `page` (default 1), `limit` (default 20, máx 100)

```json
// 200
{ "items": [...], "total": 42, "page": 1, "limit": 20 }
```

**Respuestas**: `401` sin JWT · `403` rol PATIENT (no ADMIN)

### `DELETE /api/appointments/:id`

Cancela una reserva. El `PATIENT` solo puede cancelar la propia; el `ADMIN` puede cancelar
cualquiera.

**Respuestas**

| Status | Cuándo                                         |
| ------ | ---------------------------------------------- |
| 200    | Cancelada (status pasa a `CANCELLED`)          |
| 401    | Sin JWT                                        |
| 403    | PATIENT intentando cancelar la reserva de otro |
| 404    | La reserva no existe                           |

### `POST /api/appointments/:id/request-cancellation`

Un `DOCTOR` pide cancelar una cita **propia**, con motivo — no la cancela directamente, queda
pendiente de aprobación de `ADMIN`. La cita pasa a `CANCELLATION_REQUESTED` (el horario sigue
bloqueado, no se libera hasta que se apruebe). Requiere JWT de rol **DOCTOR**.

**Body**

```json
{ "reason": "Emergencia medica" }
```

**Respuestas**

| Status | Cuándo                                                                     |
| ------ | -------------------------------------------------------------------------- |
| 201    | Pedido creado, `status: "pending"`                                         |
| 400    | La cita no está `CONFIRMED` (ya cancelada, o ya tiene un pedido pendiente) |
| 403    | La cita pertenece a otro doctor                                            |
| 404    | La cita no existe                                                          |
| 409    | Ya existe un pedido pendiente para esta cita (carrera concurrente)         |

---

## Cancellation Requests (bandeja de aprobación de ADMIN)

### `GET /api/cancellation-requests`

Lista los pedidos de cancelación **pendientes** (de todos los doctores). Requiere JWT de rol
**ADMIN**.

```json
// 200
[
  {
    "id": "uuid",
    "appointmentId": "uuid",
    "requestedBy": "uuid (userId del doctor)",
    "reason": "Emergencia medica",
    "status": "pending",
    "resolvedBy": null,
    "resolvedAt": null,
    "createdAt": "2026-..."
  }
]
```

### `POST /api/cancellation-requests/:id/approve`

Aprueba el pedido: la cita pasa a `CANCELLED` de verdad, se notifica al paciente por email y
Discord, y el horario se libera. Requiere JWT de rol **ADMIN**.

**Respuestas**: `200` pedido con `status: "approved"` · `400` el pedido ya fue resuelto · `404` no existe

### `POST /api/cancellation-requests/:id/reject`

Rechaza el pedido: la cita vuelve a `CONFIRMED` (sin notificar al paciente, para él no cambió
nada). Requiere JWT de rol **ADMIN**.

**Respuestas**: `200` pedido con `status: "rejected"` · `400` el pedido ya fue resuelto · `404` no existe

---

## Queues (cola de espera en vivo)

Distinta del agendamiento anticipado: gestiona el orden de atención del día, con o sin cita
previa. Todas las rutas `POST` operan sobre la fecha de **hoy** (UTC); `GET` acepta `date`.
En las rutas de abajo, "DOCTOR (dueño)" significa: el `:doctorId` de la ruta debe coincidir
con el perfil de doctor vinculado a la cuenta autenticada — un `DOCTOR` nunca puede operar la
cola de otro doctor (403 si lo intenta).

### `POST /api/queues/:doctorId/check-in`

Registra un turno en la cola de hoy. Requiere JWT de rol **PATIENT**, **ADMIN**, o **DOCTOR
(dueño)**.

**Body**

```json
{ "appointmentId": "uuid (opcional)", "patientName": "Juan Perez", "priority": "normal" }
```

- `patientName`: requerido siempre
- `appointmentId`: opcional — si se pasa, debe existir, pertenecer a ese doctor y estar `CONFIRMED`
- `priority`: `"normal"` (default) o `"preferente"`

**Respuestas**

| Status | Cuándo                                                                |
| ------ | --------------------------------------------------------------------- |
| 201    | Turno creado, con `number` correlativo del día                        |
| 400    | La cita referenciada no pertenece a ese doctor, o no está `CONFIRMED` |
| 404    | `appointmentId` no existe                                             |
| 409    | Esa cita **ya tiene** un turno de cola generado (doble check-in)      |

### `GET /api/queues/:doctorId`

Estado actual de la cola: turno en curso + lista de espera (ordenada por prioridad, luego
FIFO). Público.

**Query params**: `date` (opcional, `YYYY-MM-DD`, default hoy)

`photoUrl` sale de `users.photo_url` del paciente de la cita vinculada (`appointment_id`),
resuelto vía `appointments.patient_id` — `null` en walk-ins (sin cita) o si el paciente no
subió foto.

```json
// 200
{ "current": { "id": "...", "number": 3, "priority": "preferente", "status": "in-progress", "photoUrl": null, ... } | null,
  "waiting": [ { "id": "...", "number": 1, "priority": "normal", "status": "waiting", "photoUrl": "/uploads/photos/...", ... } ] }
```

### `POST /api/queues/:doctorId/next`

Marca el turno en curso como `done` y promueve el siguiente en espera (prioridad primero).
Requiere JWT de rol **ADMIN** o **DOCTOR (dueño)**.

```json
// 200
{ "finished": {...} | null, "promoted": {...} | null }
```

### `POST /api/queues/:doctorId/skip`

Igual que `/next` pero marca el turno en curso como `skipped`. Requiere JWT de rol **ADMIN**
o **DOCTOR (dueño)**.

### `POST /api/queues/:doctorId/call`

Re-anuncia el turno en curso por WebSocket, sin cambiar su estado. Requiere JWT de rol
**ADMIN** o **DOCTOR (dueño)**.

**Respuestas**: `200` turno actual · `404` no hay turno en curso

---

## Admin

### `GET /api/admin/dashboard/stats`

Métricas agregadas del sistema en una sola llamada (3 queries en paralelo del lado del
servidor). Requiere JWT de rol **ADMIN**.

```json
// 200
{
  "citasPorEstado": { "CONFIRMED": 12, "CANCELLED": 3, "CANCELLATION_REQUESTED": 1, "COMPLETED": 40 },
  "citasHoy": 5,
  "proximasCitas": 8,
  "totalCitas": 56,
  "totalPacientes": 30,
  "totalDoctoresActivos": 5,
  "totalDoctoresInactivos": 1,
  "cancelacionesPendientes": 1
}
```

- `citasHoy`: citas (cualquier estado) cuyo `start_time` cae en el día de hoy (UTC)
- `proximasCitas`: citas `CONFIRMED`/`CANCELLATION_REQUESTED` con `start_time` futuro
- `cancelacionesPendientes`: pedidos de cancelación en estado `pending`

**Respuestas**: `200` estadísticas · `401` sin JWT · `403` rol distinto de ADMIN

---

## Webhooks

### `POST /api/webhooks/github`

Recibe eventos de GitHub y notifica a Discord. Protegido por verificación HMAC-SHA256 del
header `x-hub-signature-256` (no por JWT).

**Headers requeridos**: `x-hub-signature-256`, `x-github-event`

**Respuestas**: `200` procesado · `401` firma faltante o inválida

---

## Infraestructura (fuera de `/api`)

### `GET /health`

Verifica conectividad **real** a Postgres y Redis (no solo que el proceso esté vivo). Público.

```json
// 200 - todo ok
{ "status": "ok", "checks": { "postgres": true, "redis": true } }
// 503 - alguna dependencia no responde
{ "status": "degraded", "checks": { "postgres": true, "redis": false } }
```

### `GET /api-docs`

Documentación interactiva Swagger UI (OpenAPI 3.0.3), generada desde los comentarios JSDoc de
`src/presentation/http/routes/*.ts`.

---

## WebSocket (`ws://localhost:3001/ws`)

Solo para **recibir** actualizaciones en tiempo real — todas las mutaciones van por REST.
Escala horizontalmente entre múltiples instancias vía Redis Pub/Sub.

**Cliente → Servidor**

| type                | payload        | Efecto                                                   |
| ------------------- | -------------- | -------------------------------------------------------- |
| `join-doctor-room`  | `{ doctorId }` | Suscribe la conexión a las actualizaciones de ese doctor |
| `leave-doctor-room` | `{ doctorId }` | Cancela la suscripción                                   |

**Servidor → Cliente**

| type            | payload                                    | Se emite tras                                |
| --------------- | ------------------------------------------ | -------------------------------------------- |
| `room-updated`  | `{ doctorId, availability: Slot[] }`       | Crear o cancelar una reserva de ese doctor   |
| `queue-updated` | `{ doctorId, date, currentTurn, waiting }` | check-in, `next`, `skip` o `call`            |
| `error`         | `{ message }`                              | Mensaje mal formado o `doctorId` inexistente |
