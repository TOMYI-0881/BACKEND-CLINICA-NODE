import { RejectCancellationRequest } from '../../../src/application/use-cases/RejectCancellationRequest';
import { CancellationRequest } from '../../../src/domain/entities/CancellationRequest';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { ValidationError } from '../../../src/domain/errors/ValidationError';
import { makeCancellationRequestRepo, makeAppointmentRepo, makeEventPublisher, makeQueueRepo } from './mocks';

function buildAppointment(): Appointment {
  return Appointment.create({
    id: 'apt-1',
    doctorId: 'doc-1',
    patientId: 'pat-1',
    startTime: new Date('2027-01-01T10:00:00Z'),
    endTime: new Date('2027-01-01T11:00:00Z'),
    status: 'CONFIRMED',
    createdAt: new Date(),
  });
}

describe('RejectCancellationRequest', () => {
  it('rechaza el pedido delegando en el repositorio', async () => {
    const cancellationRequests = makeCancellationRequestRepo();
    const rejected = CancellationRequest.create({
      id: 'req-1',
      appointmentId: 'apt-1',
      requestedBy: 'user-doc-1',
      reason: 'Emergencia',
      status: 'rejected',
      resolvedBy: 'admin-1',
      resolvedAt: new Date(),
      createdAt: new Date(),
    });
    cancellationRequests.resolve.mockResolvedValue(rejected);
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(buildAppointment());

    const useCase = new RejectCancellationRequest(cancellationRequests, appointments, makeEventPublisher(), makeQueueRepo());
    const result = await useCase.execute('req-1', 'admin-1');

    expect(cancellationRequests.resolve).toHaveBeenCalledWith('req-1', 'rejected', 'admin-1');
    expect(result).toBe(rejected);
  });

  it('al rechazar, el turno de cola de la cita reaparece en la espera (broadcast queue-updated)', async () => {
    const cancellationRequests = makeCancellationRequestRepo();
    cancellationRequests.resolve.mockResolvedValue(
      CancellationRequest.create({
        id: 'req-1',
        appointmentId: 'apt-1',
        requestedBy: 'user-doc-1',
        reason: 'Emergencia',
        status: 'rejected',
        resolvedBy: 'admin-1',
        resolvedAt: new Date(),
        createdAt: new Date(),
      }),
    );
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(buildAppointment());
    const events = makeEventPublisher();
    const queues = makeQueueRepo();
    queues.getStatus.mockResolvedValue({ current: null, waiting: [] });

    const useCase = new RejectCancellationRequest(cancellationRequests, appointments, events, queues);
    await useCase.execute('req-1', 'admin-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(events.publish).toHaveBeenCalledWith('doctor:doc-1', expect.objectContaining({ type: 'queue-updated' }));
  });

  it('propaga el error si el pedido ya fue resuelto', async () => {
    const cancellationRequests = makeCancellationRequestRepo();
    cancellationRequests.resolve.mockRejectedValue(new ValidationError('Este pedido ya fue resuelto'));

    const useCase = new RejectCancellationRequest(
      cancellationRequests,
      makeAppointmentRepo(),
      makeEventPublisher(),
      makeQueueRepo(),
    );
    await expect(useCase.execute('req-1', 'admin-1')).rejects.toThrow(ValidationError);
  });
});
