import { RequestAppointmentCancellation } from '../../../src/application/use-cases/RequestAppointmentCancellation';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { CancellationRequest } from '../../../src/domain/entities/CancellationRequest';
import { ForbiddenError } from '../../../src/domain/errors/ForbiddenError';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeAppointmentRepo, makeDoctorRepo, makeCancellationRequestRepo, makeEventPublisher, makeQueueRepo } from './mocks';

function buildDoctor(id: string, userId: string): Doctor {
  return Doctor.create({
    id,
    userId,
    name: 'Dr. Test',
    specialty: 'Test',
    gender: 'male',
    isActive: true,
    createdAt: new Date(),
    photoUrl: null,
  });
}

function buildAppointment(doctorId: string): Appointment {
  return Appointment.create({
    id: 'apt-1',
    doctorId,
    patientId: 'pat-1',
    startTime: new Date('2027-01-01T10:00:00Z'),
    endTime: new Date('2027-01-01T11:00:00Z'),
    status: 'CONFIRMED',
    createdAt: new Date(),
  });
}

function buildRequest(): CancellationRequest {
  return CancellationRequest.create({
    id: 'req-1',
    appointmentId: 'apt-1',
    requestedBy: 'user-doc-1',
    reason: 'Emergencia',
    status: 'pending',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date(),
  });
}

describe('RequestAppointmentCancellation', () => {
  it('un DOCTOR pide cancelar una cita propia con exito', async () => {
    const doctors = makeDoctorRepo();
    doctors.findByUserId.mockResolvedValue(buildDoctor('doc-1', 'user-doc-1'));
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(buildAppointment('doc-1'));
    const cancellationRequests = makeCancellationRequestRepo();
    const created = buildRequest();
    cancellationRequests.create.mockResolvedValue(created);

    const useCase = new RequestAppointmentCancellation(
      appointments,
      doctors,
      cancellationRequests,
      makeEventPublisher(),
      makeQueueRepo(),
    );
    const result = await useCase.execute('user-doc-1', 'apt-1', { reason: 'Emergencia' });

    expect(cancellationRequests.create).toHaveBeenCalledWith({
      appointmentId: 'apt-1',
      requestedBy: 'user-doc-1',
      reason: 'Emergencia',
    });
    expect(result).toBe(created);
  });

  it('rechaza si la cita pertenece a otro doctor', async () => {
    const doctors = makeDoctorRepo();
    doctors.findByUserId.mockResolvedValue(buildDoctor('doc-1', 'user-doc-1'));
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(buildAppointment('doc-OTRO'));
    const cancellationRequests = makeCancellationRequestRepo();

    const useCase = new RequestAppointmentCancellation(
      appointments,
      doctors,
      cancellationRequests,
      makeEventPublisher(),
      makeQueueRepo(),
    );
    await expect(useCase.execute('user-doc-1', 'apt-1', { reason: 'Emergencia' })).rejects.toThrow(ForbiddenError);
    expect(cancellationRequests.create).not.toHaveBeenCalled();
  });

  it('lanza NotFoundError si la cita no existe', async () => {
    const doctors = makeDoctorRepo();
    doctors.findByUserId.mockResolvedValue(buildDoctor('doc-1', 'user-doc-1'));
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(null);

    const useCase = new RequestAppointmentCancellation(
      appointments,
      doctors,
      makeCancellationRequestRepo(),
      makeEventPublisher(),
      makeQueueRepo(),
    );
    await expect(useCase.execute('user-doc-1', 'no-existe', { reason: 'Emergencia' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('lanza NotFoundError si el usuario no tiene perfil de doctor', async () => {
    const doctors = makeDoctorRepo();
    doctors.findByUserId.mockResolvedValue(null);

    const useCase = new RequestAppointmentCancellation(
      makeAppointmentRepo(),
      doctors,
      makeCancellationRequestRepo(),
      makeEventPublisher(),
      makeQueueRepo(),
    );
    await expect(useCase.execute('user-sin-perfil', 'apt-1', { reason: 'Emergencia' })).rejects.toThrow(
      NotFoundError,
    );
  });
});
