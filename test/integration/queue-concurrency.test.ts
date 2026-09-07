import { Pool } from 'pg';
import { createTestPool, truncateAll, createTestDoctor } from './db';
import { PostgresDoctorRepository } from '../../src/infrastructure/database/postgres/PostgresDoctorRepository';
import { PostgresQueueRepository } from '../../src/infrastructure/database/postgres/PostgresQueueRepository';
import { PostgresUserRepository } from '../../src/infrastructure/database/postgres/PostgresUserRepository';
import { PostgresAppointmentRepository } from '../../src/infrastructure/database/postgres/PostgresAppointmentRepository';
import { ConflictError } from '../../src/domain/errors/ConflictError';

describe('Concurrencia de la cola de espera contra Postgres real', () => {
  let pool: Pool;
  let doctorRepo: PostgresDoctorRepository;
  let queueRepo: PostgresQueueRepository;
  let userRepo: PostgresUserRepository;
  let appointmentRepo: PostgresAppointmentRepository;

  beforeAll(() => {
    pool = createTestPool();
    doctorRepo = new PostgresDoctorRepository(pool);
    queueRepo = new PostgresQueueRepository(pool);
    userRepo = new PostgresUserRepository(pool);
    appointmentRepo = new PostgresAppointmentRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('el indice unico (doctor_id, queue_date, number) rechaza numeros duplicados bajo insercion concurrente', async () => {
    const doctor = await createTestDoctor(doctorRepo,{ name: 'Dr. Cola', specialty: 'Test' });
    const queueDate = '2026-02-01';
    const CONCURRENT_REQUESTS = 20;

    // Insercion directa (sin el reintento de PostgresQueueRepository.checkIn) para probar
    // que la garantia real es el indice unico de la base de datos, no la logica de aplicacion.
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
        pool.query(
          `INSERT INTO turns (doctor_id, queue_date, number, patient_name, priority)
           VALUES ($1, $2, 1, $3, 'normal')`,
          [doctor.id, queueDate, `Paciente ${i}`],
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(CONCURRENT_REQUESTS - 1);
  });

  it('checkIn() asigna numeros unicos y secuenciales bajo concurrencia gracias al reintento', async () => {
    const doctor = await createTestDoctor(doctorRepo,{ name: 'Dr. Cola Reintento', specialty: 'Test' });
    const queueDate = '2026-02-02';
    const CONCURRENT_REQUESTS = 20;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
        queueRepo.checkIn({
          doctorId: doctor.id,
          queueDate,
          appointmentId: null,
          patientName: `Paciente ${i}`,
          priority: 'normal',
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(CONCURRENT_REQUESTS);

    const numbers = fulfilled
      .map((r) => (r.status === 'fulfilled' ? r.value.number : -1))
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => i + 1));
  });

  it('idx_turns_one_in_progress rechaza dos turnos in-progress simultaneos del mismo doctor', async () => {
    const doctor = await createTestDoctor(doctorRepo,{ name: 'Dr. In Progress', specialty: 'Test' });
    const queueDate = '2026-02-03';

    const t1 = await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: null,
      patientName: 'Paciente 1',
      priority: 'normal',
    });
    const t2 = await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: null,
      patientName: 'Paciente 2',
      priority: 'normal',
    });

    const results = await Promise.allSettled([
      pool.query(`UPDATE turns SET status = 'in-progress' WHERE id = $1`, [t1.id]),
      pool.query(`UPDATE turns SET status = 'in-progress' WHERE id = $1`, [t2.id]),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
  });

  it('callNext respeta la prioridad preferente al promover el siguiente turno', async () => {
    const doctor = await createTestDoctor(doctorRepo,{ name: 'Dr. Prioridad', specialty: 'Test' });
    const queueDate = '2026-02-04';

    await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: null,
      patientName: 'Normal 1',
      priority: 'normal',
    });
    await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: null,
      patientName: 'Normal 2',
      priority: 'normal',
    });
    const preferente = await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: null,
      patientName: 'Preferente',
      priority: 'preferente',
    });

    const result = await queueRepo.callNext(doctor.id, queueDate);

    expect(result.finished).toBeNull();
    expect(result.promoted?.id).toBe(preferente.id);
    expect(result.promoted?.status).toBe('in-progress');
  });

  it('dos callNext concurrentes nunca dejan mas de un turno in-progress (idx_turns_one_in_progress)', async () => {
    const doctor = await createTestDoctor(doctorRepo,{ name: 'Dr. Next Concurrente', specialty: 'Test' });
    const queueDate = '2026-02-05';

    for (let i = 0; i < 5; i += 1) {
      await queueRepo.checkIn({
        doctorId: doctor.id,
        queueDate,
        appointmentId: null,
        patientName: `Paciente ${i}`,
        priority: 'normal',
      });
    }

    // Sin turno in-progress previo, ambas llamadas intentan promover un turno en espera.
    // Segun el timing real de las dos transacciones concurrentes, hay dos desenlaces
    // validos: (a) ambas ven "sin turno actual" y compiten por promover -- la segunda en
    // confirmar viola idx_turns_one_in_progress y es rechazada con ConflictError, o (b) la
    // primera termina tan rapido que la segunda ya encuentra un turno in-progress y
    // legitimamente lo cierra y promueve el siguiente (ambas tienen exito). Lo unico que
    // debe ser invariante -- la garantia real que el indice unico impone -- es que nunca
    // queda mas de un turno in-progress ni ninguno, habiendo turnos en espera.
    const results = await Promise.allSettled([
      queueRepo.callNext(doctor.id, queueDate),
      queueRepo.callNext(doctor.id, queueDate),
    ]);

    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(ConflictError);
      }
    }

    const status = await queueRepo.getStatus(doctor.id, queueDate);
    expect(status.current).not.toBeNull();
  });

  it('idx_turns_one_per_appointment: exactamente un check-in tiene exito ante doble check-in concurrente de la misma cita', async () => {
    const doctor = await createTestDoctor(doctorRepo,{ name: 'Dr. Doble Check-in', specialty: 'Test' });
    const patient = await userRepo.save({ email: 'doble-checkin@test.com', passwordHash: 'hash', role: 'PATIENT', name: 'Test' });
    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2026-02-06T10:00:00Z'),
      endTime: new Date('2026-02-06T11:00:00Z'),
    });
    const queueDate = '2026-02-06';
    const CONCURRENT_REQUESTS = 20;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        queueRepo.checkIn({
          doctorId: doctor.id,
          queueDate,
          appointmentId: appointment.id,
          patientName: 'Paciente Doble',
          priority: 'normal',
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(CONCURRENT_REQUESTS - 1);
    for (const r of rejected) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(ConflictError);
      }
    }
  });

  it('walk-ins concurrentes SIN cita repetida siguen teniendo exito con numeros unicos (no se ven afectados por la regla anterior)', async () => {
    const doctor = await createTestDoctor(doctorRepo,{ name: 'Dr. Walkins', specialty: 'Test' });
    const queueDate = '2026-02-07';
    const CONCURRENT_REQUESTS = 20;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
        queueRepo.checkIn({
          doctorId: doctor.id,
          queueDate,
          appointmentId: null,
          patientName: `Walk-in ${i}`,
          priority: 'normal',
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(CONCURRENT_REQUESTS);

    const numbers = fulfilled
      .map((r) => (r.status === 'fulfilled' ? r.value.number : -1))
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => i + 1));
  });

  it('getStatus resuelve photoUrl del paciente via appointment_id -> patient_id, y null en walk-ins', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Fotos', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'foto-cola@test.com',
      passwordHash: 'hash',
      role: 'PATIENT',
      name: 'Paciente Foto',
    });
    const photoUrl = '/uploads/photos/foto-cola.jpg';
    await userRepo.updatePhotoUrl(patient.id, photoUrl);
    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2026-02-08T10:00:00Z'),
      endTime: new Date('2026-02-08T11:00:00Z'),
    });
    const queueDate = '2026-02-08';

    const withAppointment = await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: appointment.id,
      patientName: 'Paciente Foto',
      priority: 'normal',
    });
    const walkIn = await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: null,
      patientName: 'Walk-in Sin Foto',
      priority: 'normal',
    });

    const status = await queueRepo.getStatus(doctor.id, queueDate);
    const waitingWithAppointment = status.waiting.find((t) => t.id === withAppointment.id);
    const waitingWalkIn = status.waiting.find((t) => t.id === walkIn.id);

    expect(waitingWithAppointment?.photoUrl).toBe(photoUrl);
    expect(waitingWalkIn?.photoUrl).toBeNull();
  });

  it('findCurrent y promoteNextWaiting (via callNext) mantienen el photoUrl del paciente', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Fotos Promocion', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'foto-promocion@test.com',
      passwordHash: 'hash',
      role: 'PATIENT',
      name: 'Paciente Promocion',
    });
    const photoUrl = '/uploads/photos/foto-promocion.jpg';
    await userRepo.updatePhotoUrl(patient.id, photoUrl);
    const appointment = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2026-02-09T10:00:00Z'),
      endTime: new Date('2026-02-09T11:00:00Z'),
    });
    const queueDate = '2026-02-09';

    await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: appointment.id,
      patientName: 'Paciente Promocion',
      priority: 'normal',
    });

    const result = await queueRepo.callNext(doctor.id, queueDate);
    expect(result.promoted?.photoUrl).toBe(photoUrl);

    const current = await queueRepo.findCurrent(doctor.id, queueDate);
    expect(current?.photoUrl).toBe(photoUrl);
  });

  it('callNext marca la cita vinculada como COMPLETED al finalizar el turno; skip no la toca', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Cita Completada', specialty: 'Test' });
    const patientDone = await userRepo.save({
      email: 'turno-done@test.com',
      passwordHash: 'hash',
      role: 'PATIENT',
      name: 'Test',
    });
    const patientSkipped = await userRepo.save({
      email: 'turno-skip@test.com',
      passwordHash: 'hash',
      role: 'PATIENT',
      name: 'Test',
    });
    const appointmentDone = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patientDone.id,
      startTime: new Date('2026-02-10T10:00:00Z'),
      endTime: new Date('2026-02-10T10:30:00Z'),
    });
    const appointmentSkipped = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patientSkipped.id,
      startTime: new Date('2026-02-10T11:00:00Z'),
      endTime: new Date('2026-02-10T11:30:00Z'),
    });
    const queueDate = '2026-02-10';

    await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: appointmentDone.id,
      patientName: 'Paciente Done',
      priority: 'normal',
    });
    await queueRepo.checkIn({
      doctorId: doctor.id,
      queueDate,
      appointmentId: appointmentSkipped.id,
      patientName: 'Paciente Skip',
      priority: 'normal',
    });

    // Promueve al primero (Done) a in-progress, y lo finaliza como "done".
    await queueRepo.callNext(doctor.id, queueDate);
    await queueRepo.callNext(doctor.id, queueDate);

    const doneAppointment = await appointmentRepo.findById(appointmentDone.id);
    expect(doneAppointment?.status).toBe('COMPLETED');

    // El segundo turno (Skip) quedo in-progress tras el callNext anterior; se salta.
    await queueRepo.skip(doctor.id, queueDate);

    const skippedAppointment = await appointmentRepo.findById(appointmentSkipped.id);
    expect(skippedAppointment?.status).toBe('CONFIRMED');
  });
});
