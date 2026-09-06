import request from 'supertest';
import { buildE2EContext, closeE2EContext, truncateAll, createDoctorRow, E2EContext } from './helpers';

/**
 * El auto-enrolado en cola (CreateAppointment.enrollInQueue) es fire-and-forget: la respuesta
 * HTTP de POST /appointments no espera a que termine. Este helper sondea GET /queues/:doctorId
 * hasta que el turno aparezca (o el timeout), en vez de un sleep fijo fragil.
 */
async function waitForWaitingTurn(
  app: E2EContext['app'],
  doctorId: string,
  date: string,
  appointmentId: string,
): Promise<unknown[]> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const res = await request(app).get(`/api/queues/${doctorId}?date=${date}`);
    const waiting = res.body.waiting as Array<{ appointmentId: string | null }>;
    if (waiting.some((turn) => turn.appointmentId === appointmentId)) {
      return waiting;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timeout esperando que el turno aparezca en la cola');
}

describe('E2E: reservar encola automaticamente, cancelar la saca de la espera', () => {
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

  it('reservar aparece en la cola sin check-in manual; cancelar la saca de la espera', async () => {
    const doctor = await createDoctorRow(ctx.pool, { name: 'Dr. Auto Cola', specialty: 'Test' });

    await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'auto.cola@test.com', password: 'secret123', name: 'Auto Cola' });
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'auto.cola@test.com', password: 'secret123' });
    const patientToken = login.body.token as string;

    const date = '2026-08-01';
    const createRes = await request(ctx.app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctorId: doctor.id, startTime: `${date}T10:00:00.000Z`, endTime: `${date}T10:30:00.000Z` });
    expect(createRes.status).toBe(201);
    const appointmentId = createRes.body.id as string;

    // Aparece en la cola sin que nadie haya llamado a /check-in, con el nombre real
    // de la cuenta (no el prefijo del email).
    const waiting = await waitForWaitingTurn(ctx.app, doctor.id, date, appointmentId);
    expect(waiting).toHaveLength(1);
    expect((waiting[0] as { patientName: string }).patientName).toBe('Auto Cola');

    // Un segundo check-in manual sobre la misma cita sigue rechazandose (walk-in queda
    // separado del auto-enrolado, el checkIn estricto no cambio).
    const duplicateCheckIn = await request(ctx.app)
      .post(`/api/queues/${doctor.id}/check-in`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ appointmentId, patientName: 'Auto Cola' });
    expect(duplicateCheckIn.status).toBe(409);

    // Cancelar la cita la saca de la espera en vivo.
    const cancelRes = await request(ctx.app)
      .delete(`/api/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(cancelRes.status).toBe(200);

    const deadline = Date.now() + 2000;
    let stillWaiting = true;
    while (Date.now() < deadline && stillWaiting) {
      const statusRes = await request(ctx.app).get(`/api/queues/${doctor.id}?date=${date}`);
      const waitingNow = statusRes.body.waiting as Array<{ appointmentId: string | null }>;
      stillWaiting = waitingNow.some((turn) => turn.appointmentId === appointmentId);
      if (stillWaiting) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(stillWaiting).toBe(false);
  }, 15_000);
});
