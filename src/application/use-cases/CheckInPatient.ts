import { Turn } from '../../domain/entities/Turn';
import { QueueRepository } from '../../domain/ports/QueueRepository';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { LockService } from '../../domain/ports/LockService';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { ValidationError } from '../../domain/errors/ValidationError';
import { NotFoundError } from '../../domain/errors/NotFoundError';
import { CheckInDto } from '../dtos/CheckInDto';
import { logError } from '../logError';
import { broadcastQueueStatus } from './broadcastQueueStatus';

const LOCK_TTL_MS = 10_000;

export class CheckInPatient {
  constructor(
    private readonly queues: QueueRepository,
    private readonly appointments: AppointmentRepository,
    private readonly lock: LockService,
    private readonly events: EventPublisher,
  ) {}

  async execute(doctorId: string, queueDate: string, dto: CheckInDto): Promise<Turn> {
    if (dto.appointmentId) {
      const appointment = await this.appointments.findById(dto.appointmentId);
      if (!appointment) {
        throw new NotFoundError('La cita referenciada no existe');
      }
      if (appointment.doctorId !== doctorId) {
        throw new ValidationError('La cita no pertenece a este doctor');
      }
      if (!appointment.isConfirmed()) {
        throw new ValidationError('La cita no esta confirmada');
      }
    }

    const lockKey = `lock:queue:${doctorId}:${queueDate}`;
    const acquired = await this.lock.acquire(lockKey, { ttlMs: LOCK_TTL_MS }).catch(() => false);

    try {
      const turn = await this.queues.checkIn({
        doctorId,
        queueDate,
        appointmentId: dto.appointmentId ?? null,
        patientName: dto.patientName,
        priority: dto.priority,
      });

      broadcastQueueStatus(this.events, this.queues, doctorId, queueDate).catch(logError);

      return turn;
    } finally {
      if (acquired) await this.lock.release(lockKey).catch(logError);
    }
  }
}
