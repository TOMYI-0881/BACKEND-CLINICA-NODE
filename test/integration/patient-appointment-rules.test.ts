import { Pool } from 'pg';
import { createTestPool, truncateAll, createTestDoctor } from './db';
import { PostgresAppointmentRepository } from '../../src/infrastructure/database/postgres/PostgresAppointmentRepository';
import { PostgresDoctorRepository } from '../../src/infrastructure/database/postgres/PostgresDoctorRepository';
import { PostgresUserRepository } from '../../src/infrastructure/database/postgres/PostgresUserRepository';
import { ConflictError } from '../../src/domain/errors/ConflictError';

describe('Reglas de negocio nuevas sobre el paciente (constraints de Postgres)', () => {
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

  it('un paciente no puede tener dos citas activas con el mismo medico, aunque no se solapen en horario', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Una Cita', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'una-cita@rules.test',
      passwordHash: 'hash',
      role: 'PATIENT', name: 'Test',
    });

    await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2026-04-01T10:00:00Z'),
      endTime: new Date('2026-04-01T10:30:00Z'),
    });

    // Otro dia, sin solapamiento de horario -- igual debe rechazarse: "en cualquier fecha".
    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patient.id,
        startTime: new Date('2026-05-01T15:00:00Z'),
        endTime: new Date('2026-05-01T15:30:00Z'),
      }),
    ).rejects.toThrow(new ConflictError('Ya tenes una cita activa con este medico'));
  });

  it('un paciente puede tener citas con distintos medicos el mismo dia, pero no en el mismo horario', async () => {
    // 3 doctores para aislar cada constraint: A y B nunca se solapan entre si (prueba que
    // "distintos medicos, mismo dia" es valido); C se solapa con A (prueba el EXCLUDE
    // cross-doctor) sin que el paciente ya tenga una cita activa con C (que dispararia el
    // otro indice, el de "una cita activa por medico", y contaminaria el resultado).
    const doctorA = await createTestDoctor(doctorRepo, { name: 'Dr. A', specialty: 'Test' });
    const doctorB = await createTestDoctor(doctorRepo, { name: 'Dr. B', specialty: 'Test' });
    const doctorC = await createTestDoctor(doctorRepo, { name: 'Dr. C', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'multi-doctor@rules.test',
      passwordHash: 'hash',
      role: 'PATIENT', name: 'Test',
    });

    await appointmentRepo.save({
      doctorId: doctorA.id,
      patientId: patient.id,
      startTime: new Date('2026-04-02T10:00:00Z'),
      endTime: new Date('2026-04-02T10:30:00Z'),
    });

    // Mismo dia, horario distinto, otro doctor: valido.
    await expect(
      appointmentRepo.save({
        doctorId: doctorB.id,
        patientId: patient.id,
        startTime: new Date('2026-04-02T11:00:00Z'),
        endTime: new Date('2026-04-02T11:30:00Z'),
      }),
    ).resolves.toBeDefined();

    // Mismo dia, horario solapado con la cita del doctor A: no puede estar en dos
    // consultorios a la vez, sin importar que el doctor C sea distinto.
    await expect(
      appointmentRepo.save({
        doctorId: doctorC.id,
        patientId: patient.id,
        startTime: new Date('2026-04-02T10:15:00Z'),
        endTime: new Date('2026-04-02T10:45:00Z'),
      }),
    ).rejects.toThrow(new ConflictError('Ya tenes otra cita en ese horario con otro medico'));
  });
});
