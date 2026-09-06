import { DeactivateDoctor } from '../../../src/application/use-cases/DeactivateDoctor';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { User } from '../../../src/domain/entities/User';
import {
  makeDoctorRepo,
  makeAppointmentRepo,
  makeUserRepo,
  makeEventPublisher,
  makeNotificationService,
  makeEmailService,
  makeQueueRepo,
} from './mocks';

function buildDoctor(overrides: Partial<{ isActive: boolean }> = {}): Doctor {
  return Doctor.create({
    id: 'doc-1',
    userId: 'user-doc-1',
    name: 'Dr. Baja',
    specialty: 'Cardiologia',
    isActive: overrides.isActive ?? false,
    createdAt: new Date(),
    photoUrl: null,
  });
}

function buildAppointment(id: string, patientId: string, startTime: string): Appointment {
  return Appointment.create({
    id,
    doctorId: 'doc-1',
    patientId,
    startTime: new Date(startTime),
    endTime: new Date(new Date(startTime).getTime() + 30 * 60_000),
    status: 'CONFIRMED',
    createdAt: new Date(),
  });
}

function buildPatient(id: string): User {
  return User.create({
    id,
    email: `${id}@test.com`,
    passwordHash: 'hash',
    role: 'PATIENT',
    createdAt: new Date(),
    photoUrl: null,
    name: 'Juan Perez',
  });
}

describe('DeactivateDoctor', () => {
  it('desactiva al doctor (soft-delete)', async () => {
    const doctors = makeDoctorRepo();
    doctors.deactivate.mockResolvedValue(buildDoctor());
    const appointments = makeAppointmentRepo();
    appointments.findFutureConfirmedByDoctor.mockResolvedValue([]);

    const useCase = new DeactivateDoctor(
      doctors,
      appointments,
      makeUserRepo(),
      makeEventPublisher(),
      makeNotificationService(),
      makeEmailService(),
      makeQueueRepo(),
    );

    const result = await useCase.execute('doc-1');

    expect(doctors.deactivate).toHaveBeenCalledWith('doc-1');
    expect(result.isActive).toBe(false);
  });

  it('cancela en cascada las citas futuras confirmadas y notifica a cada paciente por email', async () => {
    const doctors = makeDoctorRepo();
    doctors.deactivate.mockResolvedValue(buildDoctor());
    const appointments = makeAppointmentRepo();
    const apt1 = buildAppointment('apt-1', 'pat-1', '2027-01-01T10:00:00Z');
    const apt2 = buildAppointment('apt-2', 'pat-2', '2027-01-02T10:00:00Z');
    appointments.findFutureConfirmedByDoctor.mockResolvedValue([apt1, apt2]);
    appointments.cancel.mockImplementation(async (id: string) => {
      const apt = id === 'apt-1' ? apt1 : apt2;
      return apt.cancel();
    });
    const users = makeUserRepo();
    users.findById.mockImplementation(async (id: string) => buildPatient(id));
    const email = makeEmailService();
    const notifier = makeNotificationService();

    const useCase = new DeactivateDoctor(
      doctors,
      appointments,
      users,
      makeEventPublisher(),
      notifier,
      email,
      makeQueueRepo(),
    );
    await useCase.execute('doc-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(appointments.cancel).toHaveBeenCalledWith('apt-1');
    expect(appointments.cancel).toHaveBeenCalledWith('apt-2');
    expect(email.send).toHaveBeenCalledWith('pat-1@test.com', expect.any(String), expect.any(String));
    expect(email.send).toHaveBeenCalledWith('pat-2@test.com', expect.any(String), expect.any(String));
    expect(notifier.notify).toHaveBeenCalledTimes(2);
  });

  it('si notificar a un paciente falla, la desactivacion igual se confirma (no bloqueante)', async () => {
    const doctors = makeDoctorRepo();
    doctors.deactivate.mockResolvedValue(buildDoctor());
    const appointments = makeAppointmentRepo();
    const apt1 = buildAppointment('apt-1', 'pat-1', '2027-01-01T10:00:00Z');
    appointments.findFutureConfirmedByDoctor.mockResolvedValue([apt1]);
    appointments.cancel.mockResolvedValue(apt1.cancel());
    const users = makeUserRepo();
    users.findById.mockResolvedValue(buildPatient('pat-1'));
    const email = makeEmailService();
    email.send.mockRejectedValue(new Error('SMTP caido'));

    const useCase = new DeactivateDoctor(
      doctors,
      appointments,
      users,
      makeEventPublisher(),
      makeNotificationService(),
      email,
      makeQueueRepo(),
    );

    await expect(useCase.execute('doc-1')).resolves.toBeDefined();
  });
});
