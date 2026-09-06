import request from 'supertest';
import { buildE2EContext, closeE2EContext, truncateAll, createDoctorRow, E2EContext } from './helpers';

async function createAdminToken(ctx: E2EContext, email: string): Promise<string> {
  await ctx.pool.query(`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'ADMIN')`, [
    email,
    '$2b$04$abcdefghijklmnopqrstuv',
  ]);
  const row = await ctx.pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  return ctx.container.tokens.sign({ userId: row.rows[0]!.id, role: 'ADMIN' });
}

describe('E2E: carga de concurrencia en check-in de la cola (seccion 10, Fase 6)', () => {
  let ctx: E2EContext;

  beforeAll(() => {
    ctx = buildE2EContext();
  });

  afterAll(async () => {
    await closeE2EContext(ctx);
  });

  beforeEach(async () => {
    await truncateAll(ctx.pool);
  });

  it(
    'doble check-in de la MISMA cita: exactamente 1 respuesta 201 y el resto 409 con 25 requests concurrentes',
    async () => {
      const CONCURRENT_REQUESTS = 25;
      const adminToken = await createAdminToken(ctx, 'carga.admin.doble@test.com');

      const patientRow = await ctx.pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role) VALUES ('carga.pac.doble@test.com', 'hash', 'PATIENT') RETURNING id`,
      );
      const doctor = await createDoctorRow(ctx.pool, { name: 'Dr. Carga Checkin', specialty: 'Test' });
      const doctorId = doctor.id;
      const appointmentRow = await ctx.pool.query<{ id: string }>(
        `INSERT INTO appointments (doctor_id, patient_id, start_time, end_time)
         VALUES ($1, $2, '2026-06-02T10:00:00Z', '2026-06-02T11:00:00Z') RETURNING id`,
        [doctorId, patientRow.rows[0]!.id],
      );
      const appointmentId = appointmentRow.rows[0]!.id;

      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          request(ctx.app)
            .post(`/api/queues/${doctorId}/check-in`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ appointmentId, patientName: 'Paciente Doble Check-in', priority: 'normal' }),
        ),
      );

      const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : -1));
      const created = statuses.filter((s) => s === 201);
      const conflicted = statuses.filter((s) => s === 409);

      expect(created).toHaveLength(1);
      expect(conflicted).toHaveLength(CONCURRENT_REQUESTS - 1);
    },
    120_000,
  );

  it(
    'walk-ins concurrentes legitimos (sin cita repetida) siguen teniendo exito con numeros unicos',
    async () => {
      const CONCURRENT_REQUESTS = 25;
      const adminToken = await createAdminToken(ctx, 'carga.admin.walkin@test.com');

      const doctor = await createDoctorRow(ctx.pool, { name: 'Dr. Carga Walkins', specialty: 'Test' });
      const doctorId = doctor.id;

      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
          request(ctx.app)
            .post(`/api/queues/${doctorId}/check-in`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ patientName: `Walk-in ${i}`, priority: 'normal' }),
        ),
      );

      const created = results.filter((r) => r.status === 'fulfilled' && r.value.status === 201);
      expect(created).toHaveLength(CONCURRENT_REQUESTS);

      const numbers = created
        .map((r) => (r.status === 'fulfilled' ? (r.value.body as { number: number }).number : -1))
        .sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => i + 1));
      expect(new Set(numbers).size).toBe(CONCURRENT_REQUESTS);
    },
    120_000,
  );
});
