import { CreateAppointment } from '../../../src/application/use-cases/CreateAppointment';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { ConflictError } from '../../../src/domain/errors/ConflictError';
import { makeAppointmentRepo, makeEventPublisher, makeLockService, makeNotificationService } from './mocks';

function buildAppointment(overrides: Partial<Parameters<typeof Appointment.create>[0]> = {}): Appointment {
  return Appointment.create({
    id: 'apt-1',
    doctorId: 'doc-1',
    patientId: 'pat-1',
    startTime: new Date('2026-03-01T10:00:00Z'),
    endTime: new Date('2026-03-01T11:00:00Z'),
    status: 'CONFIRMED',
    createdAt: new Date(),
    ...overrides,
  });
}

const baseDto = {
  doctorId: 'doc-1',
  startTime: '2026-03-01T10:00:00.000Z',
  endTime: '2026-03-01T11:00:00.000Z',
};

describe('CreateAppointment', () => {
  it('crea la reserva, adquiere el lock, lo libera y notifica (reserva exitosa)', async () => {
    const repo = makeAppointmentRepo();
    const appointment = buildAppointment();
    repo.save.mockResolvedValue(appointment);
    const lock = makeLockService();
    const events = makeEventPublisher();
    const notifier = makeNotificationService();

    const useCase = new CreateAppointment(repo, lock, events, notifier);
    const result = await useCase.execute(baseDto, 'pat-1');

    expect(result).toBe(appointment);
    expect(repo.save).toHaveBeenCalledWith({
      doctorId: 'doc-1',
      patientId: 'pat-1',
      startTime: new Date(baseDto.startTime),
      endTime: new Date(baseDto.endTime),
    });
    expect(lock.acquire).toHaveBeenCalledWith(
      'lock:doctor:doc-1:2026-03-01:10:00',
      { ttlMs: 10_000 },
    );
    // esperar a que las notificaciones no bloqueantes se disparen
    await Promise.resolve();
    await Promise.resolve();
    expect(lock.release).toHaveBeenCalledWith('lock:doctor:doc-1:2026-03-01:10:00');
    expect(notifier.notify).toHaveBeenCalledWith(expect.stringContaining('Nueva reserva'));
  });

  it('propaga ConflictError en caso de conflicto de horario y notifica el intento bloqueado', async () => {
    const repo = makeAppointmentRepo();
    repo.save.mockRejectedValue(new ConflictError('Horario ya reservado'));
    const lock = makeLockService();
    const events = makeEventPublisher();
    const notifier = makeNotificationService();

    const useCase = new CreateAppointment(repo, lock, events, notifier);

    await expect(useCase.execute(baseDto, 'pat-1')).rejects.toThrow(ConflictError);
    await Promise.resolve();
    expect(notifier.notify).toHaveBeenCalledWith(expect.stringContaining('doble reserva bloqueado'));
    expect(lock.release).toHaveBeenCalled();
  });

  it('si Redis (el lock) falla, el flujo continua y la reserva se crea igual (fail-open)', async () => {
    const repo = makeAppointmentRepo();
    const appointment = buildAppointment();
    repo.save.mockResolvedValue(appointment);
    const lock = makeLockService();
    lock.acquire.mockRejectedValue(new Error('Redis caido'));
    const events = makeEventPublisher();
    const notifier = makeNotificationService();

    const useCase = new CreateAppointment(repo, lock, events, notifier);
    const result = await useCase.execute(baseDto, 'pat-1');

    expect(result).toBe(appointment);
    expect(repo.save).toHaveBeenCalled();
    // como acquire() fallo, nunca se marco como adquirido: no debe intentar liberar
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('si la notificacion (Discord) falla, el flujo no se rompe y la reserva se retorna igual', async () => {
    const repo = makeAppointmentRepo();
    const appointment = buildAppointment();
    repo.save.mockResolvedValue(appointment);
    const lock = makeLockService();
    const events = makeEventPublisher();
    const notifier = makeNotificationService();
    notifier.notify.mockRejectedValue(new Error('Discord caido'));

    const useCase = new CreateAppointment(repo, lock, events, notifier);
    const result = await useCase.execute(baseDto, 'pat-1');

    expect(result).toBe(appointment);
  });

  it('reserva exactamente en el limite: pasa las fechas al repositorio sin ajustarlas', async () => {
    // Cita consecutiva: termina exactamente cuando otra empezaria (10:00-11:00 seguida de 11:00-12:00).
    const boundaryDto = {
      doctorId: 'doc-1',
      startTime: '2026-03-01T11:00:00.000Z',
      endTime: '2026-03-01T12:00:00.000Z',
    };
    const repo = makeAppointmentRepo();
    const appointment = buildAppointment({
      startTime: new Date(boundaryDto.startTime),
      endTime: new Date(boundaryDto.endTime),
    });
    repo.save.mockResolvedValue(appointment);
    const useCase = new CreateAppointment(repo, makeLockService(), makeEventPublisher(), makeNotificationService());

    await useCase.execute(boundaryDto, 'pat-1');

    expect(repo.save).toHaveBeenCalledWith({
      doctorId: 'doc-1',
      patientId: 'pat-1',
      startTime: new Date('2026-03-01T11:00:00.000Z'),
      endTime: new Date('2026-03-01T12:00:00.000Z'),
    });
  });
});
