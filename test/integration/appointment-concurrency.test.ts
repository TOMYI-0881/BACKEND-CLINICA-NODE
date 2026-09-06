import { Pool } from 'pg';
import { createTestPool, truncateAll, createTestDoctor } from './db';
import { PostgresAppointmentRepository } from '../../src/infrastructure/database/postgres/PostgresAppointmentRepository';
import { PostgresDoctorRepository } from '../../src/infrastructure/database/postgres/PostgresDoctorRepository';
import { PostgresUserRepository } from '../../src/infrastructure/database/postgres/PostgresUserRepository';
import { ConflictError } from '../../src/domain/errors/ConflictError';

describe('Concurrencia de reservas contra Postgres real (EXCLUDE constraint)', () => {
  let pool: Pool;
  let doctorRepo: PostgresDoctorRepository;
  let userRepo: PostgresUserRepository;
  let appointmentRepo: PostgresAppointmentRepository;

  beforeAll(() => {
    pool = createTestPool();
    doctorRepo = new PostgresDoctorRepository(pool);
    userRepo = new PostgresUserRepository(pool);
    appointmentRepo = new PostgresAppointmentRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('exactamente una reserva tiene exito cuando N requests concurrentes reservan el mismo horario', async () => {
    // Nota: se usan 8 requests (no 20-50) para este test de correctitud a nivel de Postgres
    // puro, sin el lock de Redis (que llega en la Fase 4). Con EXCLUDE constraints, Postgres
    // resuelve colisiones de alta concurrencia via su deadlock detector (deadlock_timeout ~1s
    // por ciclo, con backoff exponencial en cada reintento), lo que puede hacer este test lento
    // y variable en tiempo (no en resultado). Un N mayor sin el lock que reduce la contencion
    // real solo agrega latencia de test, no cobertura adicional. El script de carga de 20-50
    // requests de la Fase 6 corre con el lock de Redis ya en su lugar y es mucho mas rapido.
    const CONCURRENT_REQUESTS = 8;

    const doctor = await createTestDoctor(doctorRepo, {
      name: 'Dr. Concurrencia',
      specialty: 'Test',
    });
    const patients = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
        userRepo.save({
          email: `patient${i}@concurrency.test`,
          passwordHash: 'hash',
          role: 'PATIENT',
        }),
      ),
    );

    const startTime = new Date('2026-02-01T10:00:00Z');
    const endTime = new Date('2026-02-01T11:00:00Z');

    const results = await Promise.allSettled(
      patients.map((patient) =>
        appointmentRepo.save({ doctorId: doctor.id, patientId: patient.id, startTime, endTime }),
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
  }, 120_000);

  // 120s por la misma razon que el test anterior: bajo carga de maquina, el detector de
  // deadlocks de Postgres para EXCLUDE constraints puede necesitar varios ciclos de ~1s.
  it('exactamente una reserva tiene exito cuando los horarios se superponen parcialmente', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Overlap', specialty: 'Test' });
    const patients = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        userRepo.save({
          email: `overlap${i}@concurrency.test`,
          passwordHash: 'hash',
          role: 'PATIENT',
        }),
      ),
    );

    // Cada request pide un horario ligeramente distinto pero todos se solapan entre si.
    const results = await Promise.allSettled(
      patients.map((patient, i) =>
        appointmentRepo.save({
          doctorId: doctor.id,
          patientId: patient.id,
          startTime: new Date(`2026-02-02T10:${String(i).padStart(2, '0')}:00Z`),
          endTime: new Date('2026-02-02T11:00:00Z'),
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
  }, 120_000);

  it('citas consecutivas [10-11) y [11-12) no chocan (bounds por defecto de tstzrange)', async () => {
    const doctor = await createTestDoctor(doctorRepo, {
      name: 'Dr. Consecutivo',
      specialty: 'Test',
    });
    const patientA = await userRepo.save({
      email: 'a@consecutivo.test',
      passwordHash: 'hash',
      role: 'PATIENT',
    });
    const patientB = await userRepo.save({
      email: 'b@consecutivo.test',
      passwordHash: 'hash',
      role: 'PATIENT',
    });

    await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patientA.id,
      startTime: new Date('2026-02-03T10:00:00Z'),
      endTime: new Date('2026-02-03T11:00:00Z'),
    });

    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patientB.id,
        startTime: new Date('2026-02-03T11:00:00Z'),
        endTime: new Date('2026-02-03T12:00:00Z'),
      }),
    ).resolves.toBeDefined();
  });
});
