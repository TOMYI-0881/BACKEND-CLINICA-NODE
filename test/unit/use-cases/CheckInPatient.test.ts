import { CheckInPatient } from '../../../src/application/use-cases/CheckInPatient';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { Turn } from '../../../src/domain/entities/Turn';
import { ValidationError } from '../../../src/domain/errors/ValidationError';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeAppointmentRepo, makeEventPublisher, makeLockService, makeQueueRepo } from './mocks';

function buildAppointment(overrides: Partial<{ doctorId: string; status: 'CONFIRMED' | 'CANCELLED' }> = {}): Appointment {
  return Appointment.create({
    id: 'apt-1',
    doctorId: overrides.doctorId ?? 'doc-1',
    patientId: 'pat-1',
    startTime: new Date('2026-03-01T10:00:00Z'),
    endTime: new Date('2026-03-01T11:00:00Z'),
    status: overrides.status ?? 'CONFIRMED',
    createdAt: new Date(),
  });
}

function buildTurn(): Turn {
  return Turn.create({
    id: 'turn-1',
    doctorId: 'doc-1',
    appointmentId: null,
    queueDate: '2026-03-01',
    number: 1,
    patientName: 'Juan Perez',
    priority: 'normal',
    status: 'waiting',
    createdAt: new Date(),
    finishedAt: null,
    photoUrl: null,
  });
}

describe('CheckInPatient', () => {
  it('rechaza un check-in con appointmentId de otro doctor', async () => {
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(buildAppointment({ doctorId: 'doc-OTRO' }));
    const queues = makeQueueRepo();

    const useCase = new CheckInPatient(queues, appointments, makeLockService(), makeEventPublisher());

    await expect(
      useCase.execute('doc-1', '2026-03-01', {
        appointmentId: 'apt-1',
        patientName: 'Juan Perez',
        priority: 'normal',
      }),
    ).rejects.toThrow(ValidationError);
    expect(queues.checkIn).not.toHaveBeenCalled();
  });

  it('rechaza un check-in si la cita referenciada no existe', async () => {
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(null);
    const queues = makeQueueRepo();

    const useCase = new CheckInPatient(queues, appointments, makeLockService(), makeEventPublisher());

    await expect(
      useCase.execute('doc-1', '2026-03-01', {
        appointmentId: 'no-existe',
        patientName: 'Juan Perez',
        priority: 'normal',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rechaza un check-in si la cita referenciada no esta CONFIRMED', async () => {
    const appointments = makeAppointmentRepo();
    appointments.findById.mockResolvedValue(buildAppointment({ status: 'CANCELLED' }));
    const queues = makeQueueRepo();

    const useCase = new CheckInPatient(queues, appointments, makeLockService(), makeEventPublisher());

    await expect(
      useCase.execute('doc-1', '2026-03-01', {
        appointmentId: 'apt-1',
        patientName: 'Juan Perez',
        priority: 'normal',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('acepta un walk-in sin appointmentId', async () => {
    const appointments = makeAppointmentRepo();
    const queues = makeQueueRepo();
    const turn = buildTurn();
    queues.checkIn.mockResolvedValue(turn);

    const useCase = new CheckInPatient(queues, appointments, makeLockService(), makeEventPublisher());
    const result = await useCase.execute('doc-1', '2026-03-01', {
      patientName: 'Juan Perez',
      priority: 'normal',
    });

    expect(result).toBe(turn);
    expect(appointments.findById).not.toHaveBeenCalled();
    expect(queues.checkIn).toHaveBeenCalledWith({
      doctorId: 'doc-1',
      queueDate: '2026-03-01',
      appointmentId: null,
      patientName: 'Juan Perez',
      priority: 'normal',
    });
  });

  it('si Redis (el lock) falla, el check-in se procesa igual (fail-open)', async () => {
    const appointments = makeAppointmentRepo();
    const queues = makeQueueRepo();
    const turn = buildTurn();
    queues.checkIn.mockResolvedValue(turn);
    const lock = makeLockService();
    lock.acquire.mockRejectedValue(new Error('Redis caido'));

    const useCase = new CheckInPatient(queues, appointments, lock, makeEventPublisher());
    const result = await useCase.execute('doc-1', '2026-03-01', {
      patientName: 'Juan Perez',
      priority: 'normal',
    });

    expect(result).toBe(turn);
    expect(lock.release).not.toHaveBeenCalled();
  });
});
