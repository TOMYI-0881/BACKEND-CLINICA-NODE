# Cuentas existentes en la base de datos

Datos leídos directamente de la tabla `users` (y `doctors` para el detalle de especialidad)
de la base `clinica` corriendo en el contenedor `backend-clinica-node-postgres-1`.
Regenerado el 2026-09-06 (tras corregir `DATABASE_URL` en `.env`, que apuntaba al puerto 5432 en
vez de 5434, y re-crear tablas/datos porque la base había quedado sin tablas).

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
| admin@clinica.test | 64f32e9b-55c6-4f03-8766-9db4d538ff31 | `admin123` |

## DOCTOR

Creados por `npm run seed` (`scripts/seed.ts`). Todos comparten la misma contraseña de seed:
**`clinica123`**.

| nombre | especialidad | email | doctor_id | user_id | activo |
|---|---|---|---|---|---|
| Dra. Ana Fernandez | Cardiologia | ana.fernandez@clinica.test | c235a7b8-343b-483a-a111-5ac1f352431b | 71decf94-9e3e-4e8a-b1a9-bfdc7bc8a22c | sí |
| Dr. Bruno Gimenez | Pediatria | bruno.gimenez@clinica.test | 1226037a-c592-4ddd-a8d3-be64237ae49d | c579580c-4272-4f5c-9e2d-8d7019cb0993 | sí |
| Dra. Carla Lopez | Dermatologia | carla.lopez@clinica.test | b0fb359f-654c-4021-ac8b-342db788821f | 63899684-3280-4807-9376-d0922b0e656f | sí |
| Dr. Diego Martinez | Traumatologia | diego.martinez@clinica.test | 42156146-e209-46f8-b51e-7821192178b5 | 63af1bf4-d216-4d8d-a51e-ebc04e378e1b | sí |
| Dra. Elena Suarez | Clinica Medica | elena.suarez@clinica.test | 8eae9f44-25f8-4571-a2d3-9d5b24afde77 | 162ca7ae-54c3-4406-b37d-ebf6bbf59e00 | sí |

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
