# Cuentas existentes en la base de datos

Datos leídos directamente de la tabla `users` (y `doctors` para el detalle de especialidad)
de la base `clinica` corriendo en el contenedor `backend-clinica-node-postgres-1`.
Regenerado el 2026-09-07, tras hacer que `npm run seed` cree la cuenta ADMIN por defecto (antes
había que insertarla a mano cada vez que se recreaba el entorno — ver sección ADMIN).

> Las contraseñas están hasheadas con bcrypt en la base — no son recuperables. Se indica la
> contraseña conocida solo donde el origen del dato la revela (el seed).

> **Importante**: `npm run test:integration` y `npm run test:e2e` truncan `users`, `doctors`,
> `appointments`, `turns` y `appointment_cancellation_requests` en esta misma base de dev
> (`truncateAll`, corre en el `beforeEach` de cada test). Cada vez que se corren, alcanza con
> `npm run seed` para reponer TANTO los doctores demo COMO el admin (ya no hace falta recrearlo
> a mano). Este archivo puede quedar desactualizado apenas se vuelvan a correr esas suites.

## ADMIN

Ya no requiere inserción manual: `npm run seed` (`scripts/seed.ts`, función `ensureAdmin`) crea
`admin@clinica.test` automáticamente si no existe, igual de idempotente que los doctores. No hay
endpoint público para crear cuentas ADMIN (ver `AI-CONTEXT.md` / `FRONTEND_AGENT_GUIDE.md`), pero
ahora el seed cubre ese hueco por defecto en cualquier entorno nuevo (`docker compose up` +
`npm run migrate:up` + `npm run seed`).

| email              | user_id                              | contraseña |
| ------------------ | ------------------------------------ | ---------- |
| admin@clinica.test | 28f41743-6c50-4df9-8759-2b7b599ff941 | `admin123` |

## DOCTOR

Creados por `npm run seed` (`scripts/seed.ts`). Todos comparten la misma contraseña de seed:
**`clinica123`**. El nombre ya NO incluye el prefijo "Dr./Dra." (se agregó el campo `gender` —
ver migración `add-gender-to-doctors`; el frontend antepone el prefijo según género al mostrar).

| nombre         | especialidad   | genero | email                        | doctor_id                            | user_id                              | activo |
| -------------- | -------------- | ------ | ---------------------------- | ------------------------------------ | ------------------------------------- | ------ |
| Ana Fernandez  | Cardiologia    | female | ana.fernandez@clinica.test   | 1381616a-f645-47e7-b058-cf6d93b1bb67 | e988c11c-f13c-4e50-8bc6-970a0d2a0254  | sí     |
| Bruno Gimenez  | Pediatria      | male   | bruno.gimenez@clinica.test   | 2f041c0e-4c4e-43da-85db-883e89b67519 | a87f1905-c7cb-4160-bc97-fab0d16ba62d  | sí     |
| Carla Lopez    | Dermatologia   | female | carla.lopez@clinica.test     | 020634f9-6947-4986-a5cd-6ec097936a6b | c7265580-e284-4986-b2f4-0e4866d29259  | sí     |
| Diego Martinez | Traumatologia  | male   | diego.martinez@clinica.test  | 0906395b-7f10-4f74-af73-d7221b1b7bf7 | 0784a35a-ce38-4134-b8d0-bb4a92863bbb  | sí     |
| Elena Suarez   | Clinica Medica | female | elena.suarez@clinica.test    | 25e886ab-d17a-4736-bcf7-a99afefcb3cd | c23bdd18-4bb5-4286-87e8-56a229408d13  | sí     |

Además de estos 5, pueden existir otras cuentas `DOCTOR` creadas manualmente vía
`POST /api/doctors` (fuera del seed) — por ejemplo, al momento de este snapshot había una
cuenta adicional (`gthomasenrique0881@gmail.com`, especialidad "CRACK") creada probando el
flujo real de creación de doctores. Estas no se pierden con `npm run seed` (que solo crea/
verifica los 5 de arriba por nombre), pero sí con `truncateAll` de los tests.

## PATIENT

Se crean vía `POST /api/auth/register` (registro público, requiere `email`, `password` y
`name`). Al momento de este snapshot había 2 cargados (creados probando el flujo real, no por
el seed): `gthomasenrique0882@gmaill.com` y `pepe@gamil.com`. Se pierden con `truncateAll` de
los tests igual que cualquier otra cuenta.

## Cómo regenerar este listado

```bash
docker exec backend-clinica-node-postgres-1 psql -U user -d clinica -c \
  "SELECT id, email, role, name, created_at FROM users ORDER BY role, created_at;"

docker exec backend-clinica-node-postgres-1 psql -U user -d clinica -c \
  "SELECT d.id AS doctor_id, d.name, d.specialty, d.gender, d.is_active, u.email, u.id AS user_id \
   FROM doctors d JOIN users u ON u.id = d.user_id ORDER BY d.name;"
```
