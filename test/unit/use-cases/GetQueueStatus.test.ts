import { GetQueueStatus } from '../../../src/application/use-cases/GetQueueStatus';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { Turn } from '../../../src/domain/entities/Turn';
import { makeQueueRepo, makeAppointmentRepo } from './mocks';

function buildAppointment(overrides: Partial<{ doctorId: string; status: 'CONFIRMED' | 'CANCELLED' }> = {}): Appointment {
  return Appointment.create({
    id: 'apt-1',
    doctorId: overrides.doctorId ?? 'doc-1',
    patientId: 'pat-1',
    startTime: new Date('2026-03-01T10:00:00Z'),
    endTime: new Date('2026-03-01T10:30:00Z'),
    status: overrides.status ?? 'CONFIRMED',
    createdAt: new Date(),
  });
}

function buildTurn(id: string, appointmentId: string | null): Turn {
  return Turn.create({
    id,
    doctorId: 'doc-1',
    appointmentId,
    queueDate: '2026-03-01',
    number: 1,
    patientName: 'Paciente',
    priority: 'normal',
    status: 'waiting',
    createdAt: new Date(),
    finishedAt: null,
  });
}

describe('GetQueueStatus', () => {
  it('sin patientId, devuelve current/waiting tal cual y myTurn null', async () => {
    const queues = makeQueueRepo();
    queues.getStatus.mockResolvedValue({ current: null, waiting: [] });
    const appointments = makeAppointmentRepo();

    const useCase = new GetQueueStatus(queues, appointments);
    const result = await useCase.execute('doc-1', '2026-03-01');

    expect(result).toEqual({ current: null, waiting: [], myTurn: null });
    expect(appointments.findByPatient).not.toHaveBeenCalled();
  });

  it('con patientId y una cita CONFIRMED de ese doctor en esa fecha, encuentra myTurn en waiting', async () => {
    const turn = buildTurn('turn-1', 'apt-1');
    const queues = makeQueueRepo();
    queues.getStatus.mockResolvedValue({ current: null, waiting: [turn] });
    const appointments = makeAppointmentRepo();
    appointments.findByPatient.mockResolvedValue([buildAppointment()]);

    const useCase = new GetQueueStatus(queues, appointments);
    const result = await useCase.execute('doc-1', '2026-03-01', 'pat-1');

    expect(result.myTurn).toBe(turn);
  });

  it('con patientId pero sin cita CONFIRMED ese dia con ese doctor, myTurn es null', async () => {
    const queues = makeQueueRepo();
    queues.getStatus.mockResolvedValue({ current: null, waiting: [buildTurn('turn-1', 'otra-cita')] });
    const appointments = makeAppointmentRepo();
    appointments.findByPatient.mockResolvedValue([buildAppointment({ status: 'CANCELLED' })]);

    const useCase = new GetQueueStatus(queues, appointments);
    const result = await useCase.execute('doc-1', '2026-03-01', 'pat-1');

    expect(result.myTurn).toBeNull();
  });

  it('encuentra myTurn tambien cuando es el turno "current" (in-progress)', async () => {
    const current = buildTurn('turn-1', 'apt-1');
    const queues = makeQueueRepo();
    queues.getStatus.mockResolvedValue({ current, waiting: [] });
    const appointments = makeAppointmentRepo();
    appointments.findByPatient.mockResolvedValue([buildAppointment()]);

    const useCase = new GetQueueStatus(queues, appointments);
    const result = await useCase.execute('doc-1', '2026-03-01', 'pat-1');

    expect(result.myTurn).toBe(current);
  });
});
