import request from 'supertest';
import { buildE2EContext, closeE2EContext, truncateAll, createDoctorRow, E2EContext } from './helpers';

describe('E2E: carga de concurrencia en reservas (seccion 10, Fase 6)', () => {
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
    'exactamente 1 respuesta 201 y el resto 409 con 25 requests concurrentes sobre el mismo horario',
    async () => {
      const CONCURRENT_REQUESTS = 25;

      await request(ctx.app)
        .post('/api/auth/register')
        .send({ email: 'carga.paciente@test.com', password: 'secret123', name: 'Carga Paciente' });
      const loginRes = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'carga.paciente@test.com', password: 'secret123' });
      const token = loginRes.body.token as string;

      const doctor = await createDoctorRow(ctx.pool, { name: 'Dr. Carga', specialty: 'Test' });
      const doctorId = doctor.id;

      const body = {
        doctorId,
        startTime: '2026-06-01T10:00:00.000Z',
        endTime: '2026-06-01T11:00:00.000Z',
      };

      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          request(ctx.app).post('/api/appointments').set('Authorization', `Bearer ${token}`).send(body),
        ),
      );

      const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : -1));
      const created = statuses.filter((s) => s === 201);
      const conflicted = statuses.filter((s) => s === 409);

      expect(created).toHaveLength(1);
      expect(conflicted).toHaveLength(CONCURRENT_REQUESTS - 1);
      expect(created.length + conflicted.length).toBe(CONCURRENT_REQUESTS);
    },
    180_000,
  );
});
