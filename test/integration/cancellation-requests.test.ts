import { Pool } from 'pg';
import { createTestPool, truncateAll, createTestDoctor } from './db';
import { PostgresDoctorRepository } from '../../src/infrastructure/database/postgres/PostgresDoctorRepository';
import { PostgresUserRepository } from '../../src/infrastructure/database/postgres/PostgresUserRepository';
import { PostgresAppointmentRepository } from '../../src/infrastructure/database/postgres/PostgresAppointmentRepository';
import { PostgresAppointmentCancellationRequestRepository } from '../../src/infrastructure/database/postgres/PostgresAppointmentCancellationRequestRepository';
import { ConflictError } from '../../src/domain/errors/ConflictError';
import { ValidationError } from '../../src/domain/errors/ValidationError';

describe('Pedidos de cancelacion contra Postgres real', () => {
  let pool: Pool;
  let doctorRepo: PostgresDoctorRepository;
  let userRepo: PostgresUserRepository;
  let appointmentRepo: PostgresAppointmentRepository;
  let cancellationRequestRepo: PostgresAppointmentCancellationRequestRepository;

  beforeAll(() => {
    pool = createTestPool();
    doctorRepo = new PostgresDoctorRepository(pool);
    userRepo = new PostgresUserRepository(pool);
    appointmentRepo = new PostgresAppointmentRepository(pool);
    cancellationRequestRepo = new PostgresAppointmentCancellationRequestRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('idx_one_pending_request_per_appointment: el indice unico rechaza pedidos pendientes duplicados bajo insercion concurrente cruda', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Indice', specialty: 'Test' });
    const patient = await userRepo.save({ email: 'pat-indice@test.com', passwordHash: 'hash', role: 'PATIENT' });
    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-02-06T10:00:00Z'),
      endTime: new Date('2027-02-06T11:00:00Z'),
    });
    // La cita ya esta CANCELLATION_REQUESTED (bypass del guard de create(), igual que la
    // Fase 2 probaba el indice unico de turnos con INSERT crudo, sin pasar por checkIn()).
    await pool.query(`UPDATE appointments SET status = 'CANCELLATION_REQUESTED' WHERE id = $1`, [appointment.id]);

    const CONCURRENT_REQUESTS = 15;
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        pool.query(
          `INSERT INTO appointment_cancellation_requests (appointment_id, requested_by, reason) VALUES ($1, $2, $3)`,
          [appointment.id, doctor.userId, 'Emergencia'],
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(CONCURRENT_REQUESTS - 1);
  });

  it('create() bajo concurrencia real: exactamente un pedido tiene exito, el resto es rechazado por el guard de estado de la cita', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Pedidos', specialty: 'Test' });
    const patient = await userRepo.save({ email: 'pat-pedidos@test.com', passwordHash: 'hash', role: 'PATIENT' });
    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-02-01T10:00:00Z'),
      endTime: new Date('2027-02-01T11:00:00Z'),
    });

    const CONCURRENT_REQUESTS = 15;
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        cancellationRequestRepo.create({
          appointmentId: appointment.id,
          requestedBy: doctor.userId,
          reason: 'Emergencia',
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // El guard `UPDATE ... WHERE status = 'CONFIRMED'` dentro de create() ya serializa la
    // carrera (la primera transaccion en confirmar deja a las demas sin filas afectadas):
    // los perdedores nunca llegan a competir por el indice unico de pedidos pendientes,
    // asi que el motivo de rechazo es ValidationError (estado invalido), no ConflictError.
    // El indice unico sigue siendo la garantia real ante cualquier otro camino de escritura
    // (ver el test anterior, que lo prueba de forma aislada con INSERT crudo).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(CONCURRENT_REQUESTS - 1);
    for (const r of rejected) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(ValidationError);
      }
    }

    const reloaded = await appointmentRepo.findById(appointment.id);
    expect(reloaded?.status).toBe('CANCELLATION_REQUESTED');
  });

  it('el EXCLUDE bloquea el horario mientras la cancelacion esta pendiente (no se puede doble-reservar durante la revision)', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Bloqueo', specialty: 'Test' });
    const patientA = await userRepo.save({ email: 'pat-a-bloqueo@test.com', passwordHash: 'hash', role: 'PATIENT' });
    const patientB = await userRepo.save({ email: 'pat-b-bloqueo@test.com', passwordHash: 'hash', role: 'PATIENT' });

    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patientA.id,
      startTime: new Date('2027-02-02T10:00:00Z'),
      endTime: new Date('2027-02-02T11:00:00Z'),
    });

    await cancellationRequestRepo.create({
      appointmentId: appointment.id,
      requestedBy: doctor.userId,
      reason: 'Emergencia',
    });

    // Mientras el pedido esta pendiente, otro paciente intenta reservar el MISMO horario.
    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patientB.id,
        startTime: new Date('2027-02-02T10:00:00Z'),
        endTime: new Date('2027-02-02T11:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('approve() cancela la cita de verdad y libera el horario', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Aprobado', specialty: 'Test' });
    const patientA = await userRepo.save({ email: 'pat-a-aprobado@test.com', passwordHash: 'hash', role: 'PATIENT' });
    const patientB = await userRepo.save({ email: 'pat-b-aprobado@test.com', passwordHash: 'hash', role: 'PATIENT' });
    const admin = await userRepo.save({ email: 'admin-aprobado@test.com', passwordHash: 'hash', role: 'ADMIN' });

    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patientA.id,
      startTime: new Date('2027-02-03T10:00:00Z'),
      endTime: new Date('2027-02-03T11:00:00Z'),
    });
    const request = await cancellationRequestRepo.create({
      appointmentId: appointment.id,
      requestedBy: doctor.userId,
      reason: 'Emergencia',
    });

    const resolved = await cancellationRequestRepo.resolve(request.id, 'approved', admin.id);
    expect(resolved.status).toBe('approved');

    const reloaded = await appointmentRepo.findById(appointment.id);
    expect(reloaded?.status).toBe('CANCELLED');

    // El horario ahora esta libre: otro paciente puede reservarlo.
    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patientB.id,
        startTime: new Date('2027-02-03T10:00:00Z'),
        endTime: new Date('2027-02-03T11:00:00Z'),
      }),
    ).resolves.toBeDefined();
  });

  it('reject() vuelve la cita a CONFIRMED y el horario sigue bloqueado', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Rechazado', specialty: 'Test' });
    const patient = await userRepo.save({ email: 'pat-rechazado@test.com', passwordHash: 'hash', role: 'PATIENT' });
    const admin = await userRepo.save({ email: 'admin-rechazado@test.com', passwordHash: 'hash', role: 'ADMIN' });

    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-02-04T10:00:00Z'),
      endTime: new Date('2027-02-04T11:00:00Z'),
    });
    const request = await cancellationRequestRepo.create({
      appointmentId: appointment.id,
      requestedBy: doctor.userId,
      reason: 'Emergencia',
    });

    const resolved = await cancellationRequestRepo.resolve(request.id, 'rejected', admin.id);
    expect(resolved.status).toBe('rejected');

    const reloaded = await appointmentRepo.findById(appointment.id);
    expect(reloaded?.status).toBe('CONFIRMED');
  });

  it('resolve() rechaza resolver un pedido ya resuelto', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Doble Resolucion', specialty: 'Test' });
    const patient = await userRepo.save({ email: 'pat-doble-res@test.com', passwordHash: 'hash', role: 'PATIENT' });
    const admin = await userRepo.save({ email: 'admin-doble-res@test.com', passwordHash: 'hash', role: 'ADMIN' });

    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-02-05T10:00:00Z'),
      endTime: new Date('2027-02-05T11:00:00Z'),
    });
    const request = await cancellationRequestRepo.create({
      appointmentId: appointment.id,
      requestedBy: doctor.userId,
      reason: 'Emergencia',
    });
    await cancellationRequestRepo.resolve(request.id, 'approved', admin.id);

    await expect(cancellationRequestRepo.resolve(request.id, 'rejected', admin.id)).rejects.toThrow(
      'ya fue resuelto',
    );
  });
});
