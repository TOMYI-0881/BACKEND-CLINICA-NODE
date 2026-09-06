# Guía para el agente de frontend — Backend Sistema de Reservas Clínicas

Este documento es la referencia completa para implementar un frontend que consuma **toda**
la funcionalidad de este backend. Está pensado para dárselo directo a un agente de código
(o a un desarrollador) que no tiene contexto previo del proyecto. No asumas nada que no esté
acá — si algo no está documentado, revisá `ENDPOINTS.md` o preguntá antes de inventar un
contrato.

---

## 1. Qué es este backend

Sistema de reservas de turnos médicos con dos flujos independientes:

1. **Agendamiento anticipado**: un paciente reserva un horario con un doctor para una fecha
   futura (`appointments`). Nunca se permite una doble reserva del mismo doctor en el mismo
   horario — el backend garantiza esto a nivel de base de datos, así que un `409 Conflict` en
   este flujo es un caso normal a manejar en la UI, no un bug.
2. **Cola de espera en vivo** (`queues`): el día de la consulta, la clínica hace check-in de
   pacientes (con o sin cita previa) y los atiende en orden — con prioridad para
   `preferente` sobre `normal`. Es un concepto separado del agendamiento; un paciente con cita
   confirmada igual necesita hacer check-in el día de la consulta para entrar a la cola.

### Roles

- **`PATIENT`**: reserva y cancela sus propias citas, puede hacer check-in.
- **`DOCTOR`**: tiene cuenta propia (creada por un ADMIN junto con su perfil). No cancela
  citas directamente — **pide** la cancelación con un motivo, y un ADMIN la aprueba o
  rechaza. Puede ver y operar (check-in/next/skip/call) la cola de espera de **su propio**
  `doctorId` únicamente — nunca la de otro doctor.
- **`ADMIN`**: gestiona el catálogo de doctores (crear, editar, desactivar, resetear
  contraseña), ve todas las reservas, aprueba/rechaza pedidos de cancelación de los DOCTOR, y
  puede operar la cola de **cualquier** doctor.

No hay endpoint público para crear cuentas `ADMIN` — la primera se inserta a mano en la base.
Las cuentas `DOCTOR`, en cambio, sí se crean vía API (`POST /api/doctors`), porque nacen junto
con el perfil de doctor.

---

## 2. Configuración de conexión

| Config | Valor (dev/docker-compose) | Variable de entorno del **frontend** sugerida |
|---|---|---|
| Base URL HTTP | `http://localhost:3001` | `VITE_API_URL` / `NEXT_PUBLIC_API_URL` |
| Prefijo de la API | `/api` (todo excepto `/health` y `/api-docs`) | — |
| WebSocket | `ws://localhost:3001/ws` | `VITE_WS_URL` / `NEXT_PUBLIC_WS_URL` |
| Swagger UI (para explorar/probar) | `http://localhost:3001/api-docs` | — |

**CORS**: habilitado (`Access-Control-Allow-Origin: *` por defecto, configurable vía
`CORS_ORIGIN` en el backend). No hace falta proxy ni configuración especial del lado del
frontend para desarrollo local.

**Content-Type**: todos los `POST`/`DELETE`/`PATCH` con body esperan `application/json`,
excepto `POST /api/webhooks/github` (no lo vas a consumir desde el frontend — es para GitHub).

**Fechas y horas**: **todo en UTC**, formato ISO 8601 con sufijo `Z`
(ej. `2026-05-01T14:00:00.000Z`). Si generás la fecha con `new Date(...).toISOString()` en
JS/TS ya te da el formato exacto que la API espera — no uses librerías que agreguen offset
(`+00:00`) en vez de `Z`, el validador del backend (`zod`) los rechaza. Convertí a horario
local **solo para mostrar en la UI**, nunca antes de enviar al backend.

---

## 3. Autenticación (JWT)

### Flujo

1. **Pacientes**: `POST /api/auth/register` → crea un usuario (siempre rol `PATIENT`).
   **Doctores**: los crea un ADMIN vía `POST /api/doctors` (ver sección 5) — el doctor no se
   auto-registra.
2. `POST /api/auth/login` → devuelve `{ token, user }` para cualquier rol (`PATIENT`,
   `DOCTOR`, `ADMIN`). Guardá `token`.
3. En **cada** request a una ruta protegida, mandá el header:
   ```
   Authorization: Bearer <token>
   ```
4. El token expira según `JWT_EXPIRES_IN` (default `1d`). No hay endpoint de refresh — si
   expira, el backend responde `401` y el frontend debe mandar al usuario a login de nuevo.

### Dónde guardar el token

Es responsabilidad del frontend. Para una SPA simple, `localStorage` es aceptable dado que
no hay endpoint de refresh ni necesidad de cookies httpOnly en este proyecto. Si te importa
mitigar XSS, usá memoria + refresh silencioso, pero **no hay backend support para eso hoy** —
no lo inventes, avisá si hace falta.

### Cómo saber qué puede hacer el usuario logueado

El JWT decodificado (o la respuesta de login) trae `{ userId, role }`. Guardá el objeto
`user` completo (`{ id, email, role, createdAt }`) que devuelve `POST /api/auth/login` para
render condicional en la UI (mostrar/ocultar botones según `PATIENT`/`DOCTOR`/`ADMIN`) — no
confíes solo en esto para seguridad, el backend igual valida el rol en cada request.

**Para un `DOCTOR`**: el `user.id` del login es el `userId` de su cuenta, **no** el `id` de
su perfil de doctor (`Doctor.id`, el que usan las rutas `/queues/:doctorId/*`). Si tu UI
necesita mostrar/usar el `doctorId` propio (por ejemplo, para armar el link a su propia cola),
no hay un endpoint directo "dame mi perfil de doctor" — buscalo filtrando `GET /api/doctors`
por el email/nombre que ya conocés, o pedilo como mejora si hace falta un endpoint dedicado.

### Manejo de errores de auth

| Status | Significado | Qué hacer en la UI |
|---|---|---|
| `401` | Sin token, token inválido/expirado, o credenciales incorrectas en login | Redirigir a login (si no es la pantalla de login) o mostrar "credenciales inválidas" (si es login) |
| `403` | Token válido pero rol insuficiente, o acción sobre un recurso ajeno (ej. un DOCTOR intentando operar la cola de otro doctor) | Mostrar "no tenés permiso" — **no** redirigir a login, el usuario SÍ está autenticado |
| `429` | Rate limit superado en `/auth/login` (5 intentos/minuto por IP) | Mostrar "demasiados intentos, esperá un minuto" |

---

## 4. Modelos de datos (shapes exactos de las respuestas)

```typescript
type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

interface User {
  id: string;        // UUID
  email: string;
  role: UserRole;
  createdAt: string; // ISO 8601 UTC
  // passwordHash NUNCA se devuelve
}

interface Doctor {
  id: string;         // usado en las rutas /appointments (doctorId) y /queues/:doctorId
  userId: string;      // id de la cuenta de usuario vinculada (rol DOCTOR)
  name: string;
  specialty: string;
  isActive: boolean;   // false = "borrado" (soft-delete), ya no aparece en GET /doctors
  createdAt: string;
}

// CANCELLATION_REQUESTED: un DOCTOR pidio cancelar, pendiente de que ADMIN apruebe/rechace.
// El horario SIGUE bloqueado en este estado -- no se libera hasta que se aprueba.
type AppointmentStatus = 'CONFIRMED' | 'CANCELLATION_REQUESTED' | 'CANCELLED';

interface Appointment {
  id: string;
  doctorId: string;
  patientId: string;
  startTime: string;  // ISO 8601 UTC
  endTime: string;
  status: AppointmentStatus;
  createdAt: string;
}

interface Slot {
  startTime: string;  // ISO 8601 UTC
  endTime: string;
}

type CancellationRequestStatus = 'pending' | 'approved' | 'rejected';

interface CancellationRequest {
  id: string;
  appointmentId: string;
  requestedBy: string;          // userId del DOCTOR que pidio la cancelacion
  reason: string;
  status: CancellationRequestStatus;
  resolvedBy: string | null;    // userId del ADMIN que lo resolvio
  resolvedAt: string | null;
  createdAt: string;
}

type TurnPriority = 'normal' | 'preferente';
type TurnStatus = 'waiting' | 'in-progress' | 'done' | 'skipped';

interface Turn {
  id: string;
  doctorId: string;
  appointmentId: string | null;
  queueDate: string;    // 'YYYY-MM-DD'
  number: number;       // correlativo del dia, empieza en 1
  patientName: string;
  priority: TurnPriority;
  status: TurnStatus;
  createdAt: string;
  finishedAt: string | null;
}
```

### Forma de los errores

Todos los errores HTTP (no solo 2xx) devuelven este shape:

```typescript
interface ApiError {
  error: string;
  details?: Array<{ path: (string | number)[]; message: string; code: string }>; // solo en 400 de validacion (zod)
}
```

Mapeo de status a causa:

| Status | Origen |
|---|---|
| 400 | Body/query inválido (zod), o una transición de estado inválida (ej. pedir cancelar una cita que no está `CONFIRMED`) — usá `details` cuando venga, para marcar el campo con error en el formulario |
| 401 | No autenticado |
| 403 | Autenticado pero rol insuficiente, o acción sobre un recurso ajeno (cita de otro doctor, cola de otro doctor, cita de otro paciente) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (doble reserva, doble check-in de la misma cita, doble pedido de cancelación pendiente, email ya registrado) |
| 429 | Rate limit |
| 500 | Error interno — no expone detalles, solo `{ "error": "Error interno del servidor" }` |

---

## 5. Referencia completa de endpoints

> Para el detalle línea por línea (query params, body exacto, todos los status codes) usá
> **`ENDPOINTS.md`** en la raíz del repo, o `GET /api-docs` con la API corriendo. Acá va el
> resumen orientado a implementación, con notas de qué hacer en la UI después de cada acción.

### Auth

| Método | Ruta | Auth | Notas de implementación |
|---|---|---|---|
| POST | `/api/auth/register` | No | `{ email, password (min 6) }` → `201` con `User` (rol `PATIENT`). Después de registrar, hacé login automáticamente o mandá a la pantalla de login. |
| POST | `/api/auth/login` | No | `{ email, password }` → `200` con `{ token, user }`. Sirve para los 3 roles. Guardar token + user en estado global. |

### Doctors (gestión exclusiva de ADMIN, salvo el listado público)

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| GET | `/api/doctors` | No | Lista doctores **activos**, sin paginar. Usalo para poblar selects/listados. |
| POST | `/api/doctors` | ADMIN | `{ name, specialty, email, password }` → `201`. Crea la cuenta DOCTOR **y** el perfil juntos — el doctor se loguea después con ese email/password. `409` si el email ya existe. |
| PATCH | `/api/doctors/:id` | ADMIN | `{ name?, specialty? }` (al menos uno). Solo edita el perfil, no la cuenta/email. |
| DELETE | `/api/doctors/:id` | ADMIN | Soft-delete: `isActive` pasa a `false`, deja de listarse, y **cancela en cascada** las citas futuras confirmadas de ese doctor (notificando a cada paciente por email). Confirmá con el usuario antes de llamarlo — es una acción con efectos en cascada. |
| POST | `/api/doctors/:id/reset-password` | ADMIN | Genera una contraseña nueva y se la manda por email al doctor. No devuelve la contraseña en la respuesta — no la muestres ni la pidas de vuelta. |

### Appointments (agendamiento anticipado)

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| GET | `/api/appointments/availability?doctorId=&date=` | No | Devuelve slots de 30 min libres entre 09:00–18:00 UTC (ya excluye `CONFIRMED` y `CANCELLATION_REQUESTED`). Refrescar cada vez que cambia doctor o fecha en el calendario. |
| POST | `/api/appointments` | PATIENT | `{ doctorId, startTime, endTime }` (el `patientId` sale del JWT, no lo mandes). En `409` (slot ya tomado por otro mientras el usuario elegía), **refrescar la disponibilidad y mostrar el conflicto**, no reintentar ciegamente. |
| GET | `/api/appointments/mine` | PATIENT o DOCTOR | Lista propia, sin paginar. Para PATIENT: sus citas como paciente. Para DOCTOR: sus citas como doctor — **esta es la forma de obtener el `id` de una cita propia** para pedir su cancelación (ver fila de abajo), no hay otro endpoint para eso. |
| GET | `/api/appointments?page=&limit=` | ADMIN | Paginado: `{ items, total, page, limit }`. Pantalla admin de todas las reservas. |
| DELETE | `/api/appointments/:id` | PATIENT (dueño) o ADMIN | Botón "Cancelar" en "Mis turnos" (paciente) o en el listado admin. Cancelación **directa e inmediata** — distinta del flujo de pedido del DOCTOR de abajo. Actualiza `status` a `CANCELLED`, no borra el registro. |
| POST | `/api/appointments/:id/request-cancellation` | DOCTOR (dueño de la cita) | `{ reason }` → `201` con el `CancellationRequest` en estado `pending`. El DOCTOR nunca cancela directo, esto solo *pide* la cancelación. Flujo completo en la UI: `GET /appointments/mine` (rol DOCTOR) → el usuario elige una cita de la lista → `POST` a esta ruta con su `id`. `403` si la cita es de otro doctor; `400` si la cita ya no está `CONFIRMED`. |

### Cancellation Requests (bandeja de aprobación, solo ADMIN)

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| GET | `/api/cancellation-requests` | ADMIN | Lista los pedidos **pendientes** de todos los doctores. Esta es la bandeja de trabajo del ADMIN — sondeala o refrescala periódicamente (no tiene WebSocket propio). |
| POST | `/api/cancellation-requests/:id/approve` | ADMIN | La cita pasa a `CANCELLED` de verdad, se notifica al paciente (email + Discord), y el horario se libera. `400` si el pedido ya fue resuelto. |
| POST | `/api/cancellation-requests/:id/reject` | ADMIN | La cita vuelve a `CONFIRMED`. Sin notificación al paciente (para él no cambió nada). `400` si el pedido ya fue resuelto. |

### Queues (cola de espera del día)

Todas las rutas `POST` operan siempre sobre **hoy** (UTC) — no hay forma de hacer check-in
o avanzar la cola de un día pasado/futuro vía API. En `next`/`skip`/`call`/`check-in`, un
`DOCTOR` solo puede operar la cola donde `:doctorId` coincide con su propio perfil — mostrale
en la UI únicamente el control de su propia cola (no tiene sentido ni le va a funcionar
intentar operar la de otro).

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| POST | `/api/queues/:doctorId/check-in` | PATIENT, ADMIN, o DOCTOR (dueño) | `{ appointmentId?, patientName, priority? }`. Si el paciente tiene cita, mandá `appointmentId` (la UI puede pre-completar `patientName` con el nombre conocido, pero el backend igual lo requiere en el body). `409` si esa cita ya tiene un turno generado — mostrar "ya hiciste check-in". |
| GET | `/api/queues/:doctorId?date=` | No | Estado en vivo: `{ current, waiting }`. Esta es la pantalla que más se beneficia de WebSocket (ver sección 6) en vez de polling. |
| POST | `/api/queues/:doctorId/next` | ADMIN o DOCTOR (dueño) | Cierra el turno actual (`done`) y promueve el siguiente (prioridad primero). Botón "Siguiente". |
| POST | `/api/queues/:doctorId/skip` | ADMIN o DOCTOR (dueño) | Igual que `next` pero marca `skipped`. Botón "Saltar". |
| POST | `/api/queues/:doctorId/call` | ADMIN o DOCTOR (dueño) | Re-anuncia el turno actual sin cambiar estado (dispara el WebSocket de nuevo). Botón "Re-llamar". `404` si no hay nadie en curso. |

---

## 6. Tiempo real (WebSocket)

Conectate a `ws://localhost:3001/ws`. **El WebSocket es solo de lectura** — nunca mandes
comandos de mutación por acá, todas las acciones van por los endpoints REST de arriba. Úsalo
para reemplazar polling en:

- La pantalla de disponibilidad de un doctor (se actualiza cuando alguien reserva/cancela, o
  cuando se aprueba un pedido de cancelación).
- La pantalla de cola en vivo, tanto para el paciente que espera como para el ADMIN/DOCTOR que
  la opera.

### Protocolo

```typescript
// Cliente → Servidor
{ type: 'join-doctor-room', payload: { doctorId: string } }
{ type: 'leave-doctor-room', payload: { doctorId: string } }

// Servidor → Cliente
{ type: 'room-updated', payload: { doctorId: string, availability: Slot[] } }
{ type: 'queue-updated', payload: { doctorId: string, date: string, currentTurn: Turn | null, waiting: Turn[] } }
{ type: 'error', payload: { message: string } }
```

No existe un evento WebSocket para "nuevo pedido de cancelación" — la bandeja de `ADMIN`
(`GET /api/cancellation-requests`) se refresca por polling o al entrar a la pantalla, no en
tiempo real.

### Patrón de uso recomendado

1. Al entrar a la pantalla de un doctor (disponibilidad o cola), abrí (o reutilizá) la
   conexión WS y mandá `join-doctor-room` con ese `doctorId`.
2. Escuchá `room-updated`/`queue-updated` y actualizá el estado local con el `payload`
   directamente (ya viene en el shape correcto — no hace falta un refetch REST).
3. Al salir de la pantalla, mandá `leave-doctor-room` (o cerrá la conexión si no hay otra
   sala activa).
4. Si llega `{ type: 'error' }` (mensaje mal formado o `doctorId` inexistente), no rompas la
   conexión — solo logueá/mostrá el mensaje.
5. **Reconexión**: no hay heartbeat/ack propio del protocolo. Implementá reconexión con
   backoff en el cliente (librerías como `reconnecting-websocket`, o un `setTimeout` manual)
   y volvé a mandar `join-doctor-room` al reconectar — el servidor no recuerda suscripciones
   de una conexión anterior.
6. No dependas del WebSocket para la carga inicial de datos: primero pedí el estado por REST
   (`GET /api/appointments/availability` o `GET /api/queues/:doctorId`) y **después** conectá
   el WS para las actualizaciones incrementales.

---

## 7. Reglas de negocio que la UI debe respetar (no reimplementar validación, pero sí reflejarla)

- **Slots de 30 minutos, 09:00–18:00 UTC**: el calendario de reserva debería ofrecer horarios
  en esa grilla — `GET /api/appointments/availability` ya te da exactamente los slots libres,
  no hace falta calcularlos vos.
- **Citas consecutivas son válidas**: un slot `10:00–10:30` y otro `10:30–11:00` no chocan
  (el rango es `[inicio, fin)`). No hace falta lógica especial en el frontend para esto, la
  disponibilidad ya viene filtrada correctamente.
- **Prioridad de la cola**: los turnos `preferente` siempre se atienden antes que los
  `normal`, sin importar el orden de check-in. El listado `waiting` que devuelve el backend
  ya viene ordenado así — mostralo en ese orden, no lo reordenes en el frontend.
- **Un solo turno `in-progress` por doctor a la vez**: la UI del panel ADMIN/DOCTOR debería
  deshabilitar "Siguiente"/"Saltar" mientras no haya un turno actual que cerrar, aunque el
  backend igual lo maneja bien si se llama de todas formas (promueve el primero de la cola).
- **Doble check-in de la misma cita se rechaza (409)**: si el frontend ya sabe (por estado
  local) que una cita fue checkeada, deshabilitá el botón de check-in en vez de dejar que el
  usuario dispare el 409 — pero manejá el 409 igual como red de seguridad (dos tabs abiertas,
  etc.).
- **Cancelar no borra la reserva**: una cita cancelada sigue apareciendo en `GET
  /appointments/mine` con `status: 'CANCELLED'` — filtrá o mostrá distinto en la UI según
  necesites, el backend no la oculta.
- **Un DOCTOR nunca cancela directo**: el botón "Cancelar" en la UI de un DOCTOR debe llamar a
  `request-cancellation` (con un campo de motivo obligatorio), no a `DELETE /appointments/:id`
  — esa ruta le devolvería `403` de todas formas, porque no es ni el dueño (paciente) ni ADMIN.
  Mientras el pedido está `pending`, mostrale al DOCTOR y al paciente un estado tipo
  "cancelación en revisión", no "cancelada" — el horario sigue ocupado hasta que ADMIN decida.
- **Desactivar un doctor tiene efectos en cascada**: `DELETE /doctors/:id` no es un simple
  "ocultar de la lista" — cancela citas reales de pacientes reales. Pedí confirmación explícita
  en la UI antes de llamarlo.

---

## 8. Rate limiting a tener en cuenta

- Global en `/api/*`: 100 requests/minuto por IP.
- Estricto en `POST /api/auth/login`: 5 intentos/minuto por IP.

El backend devuelve headers estándar (`RateLimit-Limit`, `RateLimit-Remaining`,
`RateLimit-Reset`) en cada respuesta — podés leerlos para mostrar un aviso proactivo antes de
que el usuario pegue contra el límite, aunque no es obligatorio.

---

## 9. Datos de prueba disponibles

Si el backend corrió `npm run seed`, hay 5 doctores de ejemplo ya cargados, cada uno con su
propia cuenta `DOCTOR` (`GET /api/doctors` los devuelve, ver el README del backend para las
credenciales de seed). No hay usuarios `PATIENT` de prueba precargados — registrá uno nuevo
con `POST /api/auth/register`. Para probar el flujo de `ADMIN` necesitás que alguien inserte
un usuario con `role = 'ADMIN'` directo en la base (no hay endpoint público para esto, es
intencional).

---

## 10. Pantallas sugeridas (cobertura completa del backend)

No es un requisito rígido, pero para no dejar funcionalidad del backend sin exponer en la UI:

1. **Registro / Login** (un solo formulario de login sirve para los 3 roles; el registro es
   solo para PATIENT)
2. **Listado de doctores** (público) → click lleva a disponibilidad
3. **Disponibilidad de un doctor + reservar turno** (calendario de slots, requiere login como PATIENT)
4. **Mis turnos** (PATIENT): listado propio + botón cancelar + botón "hacer check-in" si es hoy
5. **Cola en vivo de un doctor** (público, tiempo real vía WS): turno actual + lista de espera
6. **Panel DOCTOR — Mi cola**: check-in/next/skip/call sobre su propio `doctorId` únicamente
7. **Panel DOCTOR — Mis citas / Pedir cancelación**: lista (`GET /appointments/mine`) desde la
   que el doctor elige una cita propia y pide cancelarla con un motivo obligatorio — no hace
   falta que el doctor conozca el `id` de antemano, la pantalla se lo muestra
8. **Panel ADMIN — Doctores**: crear, editar, desactivar, resetear contraseña
9. **Panel ADMIN — Pedidos de cancelación**: bandeja con aprobar/rechazar
10. **Panel ADMIN — Todas las reservas**: listado paginado
11. **Panel ADMIN — Control de cola**: por doctor, ver estado en vivo + botones Siguiente / Saltar / Re-llamar + check-in walk-in manual

---

## 11. Cosas que este backend **no** ofrece (no las inventes)

- No hay endpoint para editar el email/contraseña propia de un usuario (solo el reset de
  contraseña de un DOCTOR hecho por ADMIN), ni para editar el `startTime`/`endTime` de una
  cita ya creada (solo crear/cancelar/pedir-cancelación).
- No hay endpoint para listar usuarios en general, ni para promover un `PATIENT` a otro rol.
- No hay flujo de invitación por email al crear un doctor — el ADMIN define la contraseña
  inicial directamente en el formulario de creación.
- No hay refresh token — el JWT expira y el usuario debe volver a loguearse.
- No hay recuperación de contraseña self-service para `PATIENT` (solo el reset que hace un
  ADMIN sobre un `DOCTOR`).
- No hay endpoint para reactivar un doctor desactivado (`isActive: false` es unidireccional
  por ahora).
- El WebSocket no admite autenticación ni mutaciones, ni tiene un evento para nuevos pedidos
  de cancelación — es solo un canal de difusión público por doctor para disponibilidad/cola.

Si tu implementación necesita algo de esta lista, es un cambio de backend, no algo para
simular o mockear silenciosamente en el frontend — avisá antes de asumir un contrato que no
existe.
