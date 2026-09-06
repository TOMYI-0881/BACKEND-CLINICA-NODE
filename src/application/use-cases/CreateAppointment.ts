import { Appointment } from '../../domain/entities/Appointment';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { LockService } from '../../domain/ports/LockService';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { NotificationService } from '../../domain/ports/NotificationService';
import { ConflictError } from '../../domain/errors/ConflictError';
import { computeFreeSlots } from '../../domain/entities/Availability';
import { CreateAppointmentDto } from '../dtos/CreateAppointmentDto';
import { logError } from '../logError';

const LOCK_TTL_MS = 10_000;

function roundTo15Min(date: Date): string {
  const minutes = Math.floor(date.getUTCMinutes() / 15) * 15;
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class CreateAppointment {
  constructor(
    private readonly repo: AppointmentRepository,
    private readonly lock: LockService,
    private readonly events: EventPublisher,
    private readonly notifier: NotificationService,
  ) {}

  async execute(dto: CreateAppointmentDto, patientId: string): Promise<Appointment> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    const date = dateKey(startTime);
    const slotKey = `lock:doctor:${dto.doctorId}:${date}:${roundTo15Min(startTime)}`;

    const acquired = await this.lock.acquire(slotKey, { ttlMs: LOCK_TTL_MS }).catch(() => false);

    try {
      const appointment = await this.repo.save({
        doctorId: dto.doctorId,
        patientId,
        startTime,
        endTime,
      });

      this.broadcastAvailability(dto.doctorId, date).catch(logError);
      this.notifier
        .notify(`Nueva reserva: doctor ${dto.doctorId}, ${date} ${dto.startTime}`)
        .catch(logError);

      return appointment;
    } catch (err) {
      if (err instanceof ConflictError) {
        this.notifier
          .notify(`Intento de doble reserva bloqueado: doctor ${dto.doctorId}, ${date}`)
          .catch(logError);
      }
      throw err;
    } finally {
      if (acquired) await this.lock.release(slotKey).catch(logError);
    }
  }

  private async broadcastAvailability(doctorId: string, date: string): Promise<void> {
    const blocking = await this.repo.findBlockingByDoctorAndDate(doctorId, date);
    const availability = computeFreeSlots(blocking, date);
    await this.events.publish(`doctor:${doctorId}`, {
      type: 'room-updated',
      payload: { doctorId, availability },
    });
  }
}
