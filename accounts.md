# Cuentas existentes en la base de datos

Datos leídos directamente de la tabla `users` (y `doctors` para el detalle de especialidad)
de la base `clinica` corriendo en el contenedor `backend-clinica-node-postgres-1`.
Regenerado el 2026-09-06.

> Las contraseñas están hasheadas con bcrypt en la base — no son recuperables. Se indica la
> contraseña conocida solo donde el origen del dato la revela (el seed de doctores).

> **Importante**: `npm run test:integration` y `npm run test:e2e` truncan `users`, `doctors`,
> `appointments`, `turns` y `appointment_cancellation_requests` en esta misma base de dev
> (`truncateAll`, corre en el `beforeEach` de cada test). Cada vez que se corren, hay que
> `npm run seed` para reponer los doctores demo, y recrear el admin a mano (no lo repone el
> seed). Este archivo puede quedar desactualizado apenas se vuelvan a correr esas suites.

## ADMIN

No hay endpoint público para crear cuentas ADMIN (ver `AI-CONTEXT.md` / `FRONTEND_AGENT_GUIDE.md`);
esta se insertó manualmente en la base.

| email | user_id | contraseña |
|---|---|---|
| admin@clinica.test | 1211b245-b66d-46cd-bbca-b87de1c58f5b | `admin123` |

## DOCTOR

Creados por `npm run seed` (`scripts/seed.ts`). Todos comparten la misma contraseña de seed:
**`clinica123`**.

| nombre | especialidad | email | doctor_id | user_id | activo |
|---|---|---|---|---|---|
| Dra. Ana Fernandez | Cardiologia | ana.fernandez@clinica.test | 84a041e8-24eb-41a8-9fae-351edaafcbed | 248b22ea-44bc-4bcc-8ee9-36fe37f16421 | sí |
| Dr. Bruno Gimenez | Pediatria | bruno.gimenez@clinica.test | d24be2a0-195f-431d-a7f8-4d58eb142385 | c0f9dce7-94c3-41df-8884-27caf1de88b8 | sí |
| Dra. Carla Lopez | Dermatologia | carla.lopez@clinica.test | cd8be646-9e11-441d-b4d8-69ce9ce8cdd2 | ec6c9f2b-73c5-407a-8d37-1f12aa4b0635 | sí |
| Dr. Diego Martinez | Traumatologia | diego.martinez@clinica.test | 6bd9c620-3c68-4966-b766-29fa3dade028 | 2d6215d6-a9a8-4b85-ba29-93c854f6bd8a | sí |
| Dra. Elena Suarez | Clinica Medica | elena.suarez@clinica.test | 8001a566-3286-4cca-a989-d8823a5cefe9 | a1020ff5-2c18-40dc-9a79-d8ca5e97e8c5 | sí |

## PATIENT

Ninguno cargado actualmente (los últimos quedaron borrados por `truncateAll` de los tests).
Se crean vía `POST /api/auth/register` (registro público, requiere `email`, `password` y,
desde el 2026-09-06, `name`).

## Cómo regenerar este listado

```bash
docker exec backend-clinica-node-postgres-1 psql -U user -d clinica -c \
  "SELECT id, email, role, name, created_at FROM users ORDER BY role, created_at;"

docker exec backend-clinica-node-postgres-1 psql -U user -d clinica -c \
  "SELECT d.id AS doctor_id, d.name, d.specialty, d.is_active, u.email, u.id AS user_id \
   FROM doctors d JOIN users u ON u.id = d.user_id ORDER BY d.name;"
```
