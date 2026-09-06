import { CancelAppointment } from '../../../src/application/use-cases/CancelAppointment';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { User } from '../../../src/domain/entities/User';
import { ForbiddenError } from '../../../src/domain/errors/ForbiddenError';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import {
  makeAppointmentRepo,
  makeEventPublisher,
  makeNotificationService,
  makeUserRepo,
  makeEmailService,
} from './mocks';

function buildAppointment(patientId: string): Appointment {
  return Appointment.create({
    id: 'apt-1',
    doctorId: 'doc-1',
    patientId,
    startTime: new Date('2026-03-01T10:00:00Z'),
    endTime: new Date('2026-03-01T11:00:00Z'),
    status: 'CONFIRMED',
    createdAt: new Date(),
  });
}

function buildPatient(id: string): User {
  return User.create({ id, email: `${id}@test.com`, passwordHash: 'hash', role: 'PATIENT', createdAt: new Date() });
}

describe('CancelAppointment', () => {
  it('un PATIENT no puede cancelar la reserva de otro paciente', async () => {
    const repo = makeAppointmentRepo();
    repo.findById.mockResolvedValue(buildAppointment('pat-owner'));
    const useCase = new CancelAppointment(
      repo,
      makeUserRepo(),
      makeEventPublisher(),
      makeNotificationService(),
      makeEmailService(),
    );

    await expect(
      useCase.execute({ appointmentId: 'apt-1' }, { userId: 'pat-otro', role: 'PATIENT' }),
    ).rejects.toThrow(ForbiddenError);
    expect(repo.cancel).not.toHaveBeenCalled();
  });

  it('un PATIENT puede cancelar su propia reserva', async () => {
    const repo = makeAppointmentRepo();
    repo.findById.mockResolvedValue(buildAppointment('pat-owner'));
    const cancelled = buildAppointment('pat-owner').cancel();
    repo.cancel.mockResolvedValue(cancelled);
    const useCase = new CancelAppointment(
      repo,
      makeUserRepo(),
      makeEventPublisher(),
      makeNotificationService(),
      makeEmailService(),
    );

    const result = await useCase.execute({ appointmentId: 'apt-1' }, { userId: 'pat-owner', role: 'PATIENT' });

    expect(result).toBe(cancelled);
    expect(repo.cancel).toHaveBeenCalledWith('apt-1');
  });

  it('un ADMIN puede cancelar la reserva de cualquier paciente', async () => {
    const repo = makeAppointmentRepo();
    repo.findById.mockResolvedValue(buildAppointment('pat-owner'));
    const cancelled = buildAppointment('pat-owner').cancel();
    repo.cancel.mockResolvedValue(cancelled);
    const useCase = new CancelAppointment(
      repo,
      makeUserRepo(),
      makeEventPublisher(),
      makeNotificationService(),
      makeEmailService(),
    );

    const result = await useCase.execute({ appointmentId: 'apt-1' }, { userId: 'admin-1', role: 'ADMIN' });

    expect(result).toBe(cancelled);
  });

  it('lanza NotFoundError si la reserva no existe', async () => {
    const repo = makeAppointmentRepo();
    repo.findById.mockResolvedValue(null);
    const useCase = new CancelAppointment(
      repo,
      makeUserRepo(),
      makeEventPublisher(),
      makeNotificationService(),
      makeEmailService(),
    );

    await expect(
      useCase.execute({ appointmentId: 'no-existe' }, { userId: 'pat-1', role: 'PATIENT' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('si la notificacion (Discord) falla, la cancelacion igual se confirma (no bloqueante)', async () => {
    const repo = makeAppointmentRepo();
    repo.findById.mockResolvedValue(buildAppointment('pat-owner'));
    const cancelled = buildAppointment('pat-owner').cancel();
    repo.cancel.mockResolvedValue(cancelled);
    const notifier = makeNotificationService();
    notifier.notify.mockRejectedValue(new Error('Discord caido'));

    const useCase = new CancelAppointment(repo, makeUserRepo(), makeEventPublisher(), notifier, makeEmailService());
    const result = await useCase.execute({ appointmentId: 'apt-1' }, { userId: 'pat-owner', role: 'PATIENT' });

    expect(result).toBe(cancelled);
  });

  it('si el email al paciente falla, la cancelacion igual se confirma (no bloqueante)', async () => {
    const repo = makeAppointmentRepo();
    repo.findById.mockResolvedValue(buildAppointment('pat-owner'));
    const cancelled = buildAppointment('pat-owner').cancel();
    repo.cancel.mockResolvedValue(cancelled);
    const users = makeUserRepo();
    users.findById.mockResolvedValue(buildPatient('pat-owner'));
    const email = makeEmailService();
    email.send.mockRejectedValue(new Error('SMTP caido'));

    const useCase = new CancelAppointment(repo, users, makeEventPublisher(), makeNotificationService(), email);
    const result = await useCase.execute({ appointmentId: 'apt-1' }, { userId: 'pat-owner', role: 'PATIENT' });

    expect(result).toBe(cancelled);
  });

  it('notifica por email al paciente afectado usando su email registrado', async () => {
    const repo = makeAppointmentRepo();
    repo.findById.mockResolvedValue(buildAppointment('pat-owner'));
    const cancelled = buildAppointment('pat-owner').cancel();
    repo.cancel.mockResolvedValue(cancelled);
    const users = makeUserRepo();
    const patient = buildPatient('pat-owner');
    users.findById.mockResolvedValue(patient);
    const email = makeEmailService();

    const useCase = new CancelAppointment(repo, users, makeEventPublisher(), makeNotificationService(), email);
    await useCase.execute({ appointmentId: 'apt-1' }, { userId: 'admin-1', role: 'ADMIN' });
    await Promise.resolve();
    await Promise.resolve();

    expect(email.send).toHaveBeenCalledWith(patient.email, expect.any(String), expect.any(String));
  });
});
