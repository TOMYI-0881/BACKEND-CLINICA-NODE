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

  it('un paciente no puede reservar dos veces el mismo dia con el mismo medico, aunque no se solapen en horario', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Mismo Dia', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'mismo-dia@rules.test',
      passwordHash: 'hash',
      role: 'PATIENT', name: 'Test',
    });

    await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-04-01T10:00:00Z'),
      endTime: new Date('2027-04-01T10:30:00Z'),
    });

    // Mismo dia calendario, horario distinto sin solapar -- igual se rechaza: la regla es
    // "una cita por medico por dia", no por horario.
    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patient.id,
        startTime: new Date('2027-04-01T15:00:00Z'),
        endTime: new Date('2027-04-01T15:30:00Z'),
      }),
    ).rejects.toThrow(
      new ConflictError('Ya tenés una cita con este doctor para ese día. Esperá a ser atendido.'),
    );
  });

  it('un paciente ya atendido (COMPLETED) no puede reservar de nuevo ese mismo dia con el mismo medico', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Atendido Mismo Dia', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'atendido-mismo-dia@rules.test',
      passwordHash: 'hash',
      role: 'PATIENT', name: 'Test',
    });

    const attended = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-04-10T10:00:00Z'),
      endTime: new Date('2027-04-10T10:30:00Z'),
    });
    // Simula el cierre real via cola (PostgresQueueRepository.finishCurrentTurn marca
    // COMPLETED al hacer callNext sobre un turno "done"), sin depender del reloj.
    await pool.query(`UPDATE appointments SET status = 'COMPLETED' WHERE id = $1`, [attended.id]);

    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patient.id,
        startTime: new Date('2027-04-10T15:00:00Z'),
        endTime: new Date('2027-04-10T15:30:00Z'),
      }),
    ).rejects.toThrow(
      new ConflictError('Ya fuiste atendido por este doctor hoy. Podés reservar para otro día.'),
    );
  });

  it('un paciente atendido puede reservar al dia siguiente con el mismo medico', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Atendido Dia Siguiente', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'atendido-dia-siguiente@rules.test',
      passwordHash: 'hash',
      role: 'PATIENT', name: 'Test',
    });

    const attended = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-04-11T10:00:00Z'),
      endTime: new Date('2027-04-11T10:30:00Z'),
    });
    await pool.query(`UPDATE appointments SET status = 'COMPLETED' WHERE id = $1`, [attended.id]);

    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patient.id,
        startTime: new Date('2027-04-12T10:00:00Z'),
        endTime: new Date('2027-04-12T10:30:00Z'),
      }),
    ).resolves.toBeDefined();
  });

  it('antes de ser atendido, cancelar y reservar otro horario el mismo dia con el mismo medico no se bloquea', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Reprograma Mismo Dia', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'reprograma-mismo-dia@rules.test',
      passwordHash: 'hash',
      role: 'PATIENT', name: 'Test',
    });

    const original = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-04-13T10:00:00Z'),
      endTime: new Date('2027-04-13T10:30:00Z'),
    });
    await appointmentRepo.cancel(original.id);

    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patient.id,
        startTime: new Date('2027-04-13T15:00:00Z'),
        endTime: new Date('2027-04-13T15:30:00Z'),
      }),
    ).resolves.toBeDefined();
  });

  it('un paciente puede tener citas CONFIRMED con el mismo medico en dias distintos (relajacion de la regla previa)', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Dias Distintos', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'dias-distintos@rules.test',
      passwordHash: 'hash',
      role: 'PATIENT', name: 'Test',
    });

    await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-04-20T10:00:00Z'),
      endTime: new Date('2027-04-20T10:30:00Z'),
    });

    await expect(
      appointmentRepo.save({
        doctorId: doctor.id,
        patientId: patient.id,
        startTime: new Date('2027-04-21T10:00:00Z'),
        endTime: new Date('2027-04-21T10:30:00Z'),
      }),
    ).resolves.toBeDefined();
  });

  it('una cita pasada ya atendida no bloquea una cita futura con el mismo medico (se marca COMPLETED)', async () => {
    const doctor = await createTestDoctor(doctorRepo, { name: 'Dr. Cita Pasada', specialty: 'Test' });
    const patient = await userRepo.save({
      email: 'cita-pasada@rules.test',
      passwordHash: 'hash',
      role: 'PATIENT', name: 'Test',
    });

    const past = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2020-01-01T10:00:00Z'),
      endTime: new Date('2020-01-01T10:30:00Z'),
    });

    const future = await appointmentRepo.save({
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date('2027-06-01T10:00:00Z'),
      endTime: new Date('2027-06-01T10:30:00Z'),
    });
    expect(future).toBeDefined();

    const appointments = await appointmentRepo.findByPatient(patient.id);
    const pastReloaded = appointments.find((a) => a.id === past.id);
    expect(pastReloaded?.status).toBe('COMPLETED');
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
