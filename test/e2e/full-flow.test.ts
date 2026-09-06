import request from 'supertest';
import { buildE2EContext, closeE2EContext, truncateAll, todayUtc, createDoctorRow, E2EContext } from './helpers';

describe('E2E: flujo completo del sistema de reservas (seccion 10, Fase 6)', () => {
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

  it('registra, autentica, crea una cita, rechaza el duplicado, cancela, y un admin lista todas', async () => {
    // 1. Registrar paciente
    const registerRes = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'flujo.paciente@test.com', password: 'secret123' });
    expect(registerRes.status).toBe(201);

    // 2. Autenticar paciente
    const loginRes = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'flujo.paciente@test.com', password: 'secret123' });
    expect(loginRes.status).toBe(200);
    const patientToken = loginRes.body.token as string;

    // Crear un admin (directo en BD, ya que no hay endpoint publico para crear ADMINs)
    // y un doctor a traves de la API, para el resto del flujo.
    await ctx.pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'ADMIN')`,
      ['flujo.admin@test.com', '$2b$04$abcdefghijklmnopqrstuv'],
    );
    const adminRow = await ctx.pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      'flujo.admin@test.com',
    ]);
    const adminToken = ctx.container.tokens.sign({ userId: adminRow.rows[0]!.id, role: 'ADMIN' });

    const createDoctorRes = await request(ctx.app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. E2E', specialty: 'Clinica Medica', email: 'dr.e2e@test.com', password: 'secret123' });
    expect(createDoctorRes.status).toBe(201);
    const doctorId = createDoctorRes.body.id as string;

    // 3. Crear una cita
    const createRes = await request(ctx.app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctorId, startTime: '2026-04-01T10:00:00.000Z', endTime: '2026-04-01T11:00:00.000Z' });
    expect(createRes.status).toBe(201);
    const appointmentId = createRes.body.id as string;

    // 4. Intentar duplicarla
    const duplicateRes = await request(ctx.app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctorId, startTime: '2026-04-01T10:00:00.000Z', endTime: '2026-04-01T11:00:00.000Z' });
    expect(duplicateRes.status).toBe(409);

    // 5. Cancelarla
    const cancelRes = await request(ctx.app)
      .delete(`/api/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');

    // 6. Un admin lista todas las reservas
    const listRes = await request(ctx.app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].id).toBe(appointmentId);
  });

  it('flujo completo de cola: check-in de 3 pacientes con distinta prioridad y next respeta la prioridad', async () => {
    const doctor = await createDoctorRow(ctx.pool, { name: 'Dr. Cola E2E', specialty: 'Test' });
    const doctorId = doctor.id;

    await ctx.pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'ADMIN')`,
      ['flujo.admin.cola@test.com', '$2b$04$abcdefghijklmnopqrstuv'],
    );
    const adminRow = await ctx.pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      'flujo.admin.cola@test.com',
    ]);
    const adminToken = ctx.container.tokens.sign({ userId: adminRow.rows[0]!.id, role: 'ADMIN' });

    // Normal 1 y Normal 2 (creados primero), luego Preferente (creado despues).
    const normal1 = await request(ctx.app)
      .post(`/api/queues/${doctorId}/check-in`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patientName: 'Normal Uno', priority: 'normal' });
    expect(normal1.status).toBe(201);
    expect(normal1.body.number).toBe(1);

    const normal2 = await request(ctx.app)
      .post(`/api/queues/${doctorId}/check-in`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patientName: 'Normal Dos', priority: 'normal' });
    expect(normal2.status).toBe(201);
    expect(normal2.body.number).toBe(2);

    const preferente = await request(ctx.app)
      .post(`/api/queues/${doctorId}/check-in`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patientName: 'Preferente Uno', priority: 'preferente' });
    expect(preferente.status).toBe(201);
    expect(preferente.body.number).toBe(3);

    // Estado inicial: nadie en curso, 3 en espera.
    const statusRes = await request(ctx.app).get(`/api/queues/${doctorId}?date=${todayUtc()}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.current).toBeNull();
    expect(statusRes.body.waiting).toHaveLength(3);

    // POST next: el preferente (creado despues) debe promoverse antes que los normales.
    const nextRes = await request(ctx.app)
      .post(`/api/queues/${doctorId}/next`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(nextRes.status).toBe(200);
    expect(nextRes.body.finished).toBeNull();
    expect(nextRes.body.promoted.id).toBe(preferente.body.id);
    expect(nextRes.body.promoted.priority).toBe('preferente');

    const statusAfterNext = await request(ctx.app).get(`/api/queues/${doctorId}`);
    expect(statusAfterNext.body.current.id).toBe(preferente.body.id);
    expect(statusAfterNext.body.waiting).toHaveLength(2);
  });

  it('un DOCTOR descubre el id de su propia cita via GET /appointments/mine y pide cancelarla', async () => {
    // Este es el flujo que resuelve el gap real: un DOCTOR no tiene forma de saber el
    // appointmentId de una cita propia sin este endpoint -- antes solo existia para PATIENT.
    const doctorRow = await ctx.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ('doctor.mine@test.com', $1, 'DOCTOR') RETURNING id`,
      ['hash'],
    );
    const doctorUserId = doctorRow.rows[0]!.id;
    const doctorProfileRow = await ctx.pool.query<{ id: string }>(
      `INSERT INTO doctors (user_id, name, specialty) VALUES ($1, 'Dr. Mine', 'Test') RETURNING id`,
      [doctorUserId],
    );
    const doctorId = doctorProfileRow.rows[0]!.id;
    const doctorToken = ctx.container.tokens.sign({ userId: doctorUserId, role: 'DOCTOR' });

    await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'pat.mine@test.com', password: 'secret123' });
    const patientLogin = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'pat.mine@test.com', password: 'secret123' });
    const patientToken = patientLogin.body.token as string;

    const createRes = await request(ctx.app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctorId, startTime: '2027-05-01T10:00:00.000Z', endTime: '2027-05-01T10:30:00.000Z' });
    expect(createRes.status).toBe(201);
    const appointmentId = createRes.body.id as string;

    // El doctor lista sus propias citas (sin conocer el id de antemano) y encuentra la suya.
    const mineRes = await request(ctx.app).get('/api/appointments/mine').set('Authorization', `Bearer ${doctorToken}`);
    expect(mineRes.status).toBe(200);
    expect(mineRes.body).toHaveLength(1);
    expect(mineRes.body[0].id).toBe(appointmentId);

    const requestRes = await request(ctx.app)
      .post(`/api/appointments/${mineRes.body[0].id}/request-cancellation`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ reason: 'Emergencia medica' });
    expect(requestRes.status).toBe(201);
    expect(requestRes.body.status).toBe('pending');

    const appointmentAfter = await ctx.pool.query<{ status: string }>('SELECT status FROM appointments WHERE id = $1', [
      appointmentId,
    ]);
    expect(appointmentAfter.rows[0]!.status).toBe('CANCELLATION_REQUESTED');
  });
});
