import { ApproveCancellationRequest } from '../../../src/application/use-cases/ApproveCancellationRequest';
import { CancellationRequest } from '../../../src/domain/entities/CancellationRequest';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { User } from '../../../src/domain/entities/User';
import { ValidationError } from '../../../src/domain/errors/ValidationError';
import {
  makeCancellationRequestRepo,
  makeAppointmentRepo,
  makeDoctorRepo,
  makeUserRepo,
  makeEventPublisher,
  makeNotificationService,
  makeEmailService,
  makeQueueRepo,
} from './mocks';

function buildResolvedRequest(): CancellationRequest {
  return CancellationRequest.create({
    id: 'req-1',
    appointmentId: 'apt-1',
    requestedBy: 'user-doc-1',
    reason: 'Emergencia',
    status: 'approved',
    resolvedBy: 'admin-1',
    resolvedAt: new Date(),
    createdAt: new Date(),
  });
}

function buildAppointment(): Appointment {
  return Appointment.create({
    id: 'apt-1',
    doctorId: 'doc-1',
    patientId: 'pat-1',
    startTime: new Date('2027-01-01T10:00:00Z'),
    endTime: new Date('2027-01-01T11:00:00Z'),
    status: 'CANCELLED',
    createdAt: new Date(),
  });
}

describe('ApproveCancellationRequest', () => {
  it('aprueba el pedido y notifica al paciente por email y Discord', async () => {
    const cancellationRequests = makeCancellationRequestRepo();
    cancellationRequests.resolve.mockResolvedValue(buildResolvedRequest());
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(buildAppointment());
    const doctors = makeDoctorRepo();
    doctors.findById.mockResolvedValue(
      Doctor.create({
        id: 'doc-1',
        userId: 'u1',
        name: 'Dr. Test',
        specialty: 'Test',
        isActive: true,
        createdAt: new Date(),
        photoUrl: null,
      }),
    );
    const users = makeUserRepo();
    users.findById.mockResolvedValue(
      User.create({
        id: 'pat-1',
        email: 'pat-1@test.com',
        passwordHash: 'h',
        role: 'PATIENT',
        createdAt: new Date(),
        photoUrl: null,
        name: 'Juan Perez',
      }),
    );
    const notifier = makeNotificationService();
    const email = makeEmailService();

    const useCase = new ApproveCancellationRequest(
      cancellationRequests,
      appointments,
      doctors,
      users,
      makeEventPublisher(),
      notifier,
      email,
      makeQueueRepo(),
    );
    const result = await useCase.execute('req-1', 'admin-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(cancellationRequests.resolve).toHaveBeenCalledWith('req-1', 'approved', 'admin-1');
    expect(result.status).toBe('approved');
    expect(email.send).toHaveBeenCalledWith('pat-1@test.com', expect.any(String), expect.any(String));
    expect(notifier.notify).toHaveBeenCalled();
  });

  it('propaga el error si el pedido ya fue resuelto', async () => {
    const cancellationRequests = makeCancellationRequestRepo();
    cancellationRequests.resolve.mockRejectedValue(new ValidationError('Este pedido ya fue resuelto'));

    const useCase = new ApproveCancellationRequest(
      cancellationRequests,
      makeAppointmentRepo(),
      makeDoctorRepo(),
      makeUserRepo(),
      makeEventPublisher(),
      makeNotificationService(),
      makeEmailService(),
      makeQueueRepo(),
    );

    await expect(useCase.execute('req-1', 'admin-1')).rejects.toThrow(ValidationError);
  });
});
