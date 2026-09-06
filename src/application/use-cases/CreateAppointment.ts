import { Appointment } from '../../domain/entities/Appointment';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { LockService } from '../../domain/ports/LockService';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { NotificationService } from '../../domain/ports/NotificationService';
import { UserRepository } from '../../domain/ports/UserRepository';
import { QueueRepository } from '../../domain/ports/QueueRepository';
import { ConflictError } from '../../domain/errors/ConflictError';
import { computeFreeSlots } from '../../domain/entities/Availability';
import { CreateAppointmentDto } from '../dtos/CreateAppointmentDto';
import { broadcastQueueStatus } from './broadcastQueueStatus';
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
    private readonly users: UserRepository,
    private readonly queues: QueueRepository,
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
      this.enrollInQueue(appointment, dto.doctorId, date).catch(logError);

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

  /**
   * Reservar = entrar en cola automaticamente (el check-in manual queda solo para
   * walk-ins). Fail-open: la cita ya esta persistida, un fallo aca nunca debe tirar
   * abajo una reserva valida -- por eso el caller la llama con .catch(logError), sin
   * esperar a que termine.
   */
  private async enrollInQueue(appointment: Appointment, doctorId: string, date: string): Promise<void> {
    const patient = await this.users.findById(appointment.patientId);
    // patient.name es '' para cuentas viejas/doctor/admin (no pasan por RegisterUser) -- cae
    // al prefijo del email, mismo fallback que ya existia antes de guardar el nombre real.
    const patientName = patient?.name || patient?.email.split('@')[0] || 'Paciente';

    await this.queues.checkIn({
      doctorId,
      queueDate: date,
      appointmentId: appointment.id,
      patientName,
      priority: 'normal',
    });

    await broadcastQueueStatus(this.events, this.queues, doctorId, date);
  }
}
