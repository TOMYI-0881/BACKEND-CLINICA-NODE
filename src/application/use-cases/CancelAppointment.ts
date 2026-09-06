import { Appointment } from '../../domain/entities/Appointment';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { NotificationService } from '../../domain/ports/NotificationService';
import { EmailService } from '../../domain/ports/EmailService';
import { QueueRepository } from '../../domain/ports/QueueRepository';
import { NotFoundError } from '../../domain/errors/NotFoundError';
import { ForbiddenError } from '../../domain/errors/ForbiddenError';
import { computeFreeSlots } from '../../domain/entities/Availability';
import { CancelAppointmentDto } from '../dtos/CancelAppointmentDto';
import { broadcastQueueStatus } from './broadcastQueueStatus';
import { logError } from '../logError';
import { UserRole } from '../../domain/entities/User';

export interface Requester {
  userId: string;
  role: UserRole;
}

export class CancelAppointment {
  constructor(
    private readonly repo: AppointmentRepository,
    private readonly users: UserRepository,
    private readonly events: EventPublisher,
    private readonly notifier: NotificationService,
    private readonly email: EmailService,
    private readonly queues: QueueRepository,
  ) {}

  async execute(dto: CancelAppointmentDto, requester: Requester): Promise<Appointment> {
    const appointment = await this.repo.findById(dto.appointmentId);
    if (!appointment) {
      throw new NotFoundError('Reserva no encontrada');
    }

    if (requester.role === 'PATIENT' && !appointment.belongsTo(requester.userId)) {
      throw new ForbiddenError('No podes cancelar la reserva de otro paciente');
    }

    const cancelled = await this.repo.cancel(dto.appointmentId);

    const date = cancelled.startTime.toISOString().slice(0, 10);
    this.broadcastAvailability(cancelled.doctorId, date).catch(logError);
    this.notifier
      .notify(`Reserva cancelada: doctor ${cancelled.doctorId}, ${date}`)
      .catch(logError);
    this.notifyPatient(cancelled.patientId, cancelled.startTime).catch(logError);
    broadcastQueueStatus(this.events, this.queues, cancelled.doctorId, date).catch(logError);

    return cancelled;
  }

  private async notifyPatient(patientId: string, startTime: Date): Promise<void> {
    const patient = await this.users.findById(patientId);
    if (!patient) return;
    await this.email.send(
      patient.email,
      'Cita cancelada',
      `Tu cita del ${startTime.toISOString()} fue cancelada.`,
    );
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
