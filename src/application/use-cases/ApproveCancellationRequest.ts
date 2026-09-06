import { CancellationRequest } from '../../domain/entities/CancellationRequest';
import { AppointmentCancellationRequestRepository } from '../../domain/ports/AppointmentCancellationRequestRepository';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { NotificationService } from '../../domain/ports/NotificationService';
import { EmailService } from '../../domain/ports/EmailService';
import { QueueRepository } from '../../domain/ports/QueueRepository';
import { computeFreeSlots } from '../../domain/entities/Availability';
import { broadcastQueueStatus } from './broadcastQueueStatus';
import { logError } from '../logError';

/** ADMIN aprueba el pedido de cancelacion de un DOCTOR: la cita se cancela de verdad. */
export class ApproveCancellationRequest {
  constructor(
    private readonly cancellationRequests: AppointmentCancellationRequestRepository,
    private readonly appointments: AppointmentRepository,
    private readonly doctors: DoctorRepository,
    private readonly users: UserRepository,
    private readonly events: EventPublisher,
    private readonly notifier: NotificationService,
    private readonly email: EmailService,
    private readonly queues: QueueRepository,
  ) {}

  async execute(requestId: string, adminUserId: string): Promise<CancellationRequest> {
    const resolved = await this.cancellationRequests.resolve(requestId, 'approved', adminUserId);

    const appointment = await this.appointments.findById(resolved.appointmentId);
    if (appointment) {
      this.notifyPatient(appointment.patientId, appointment.doctorId, appointment.startTime).catch(logError);

      const date = appointment.startTime.toISOString().slice(0, 10);
      this.broadcastAvailability(appointment.doctorId, date).catch(logError);
      broadcastQueueStatus(this.events, this.queues, appointment.doctorId, date).catch(logError);
    }

    return resolved;
  }

  private async notifyPatient(patientId: string, doctorId: string, startTime: Date): Promise<void> {
    const [patient, doctor] = await Promise.all([this.users.findById(patientId), this.doctors.findById(doctorId)]);
    if (!patient) return;

    const doctorName = doctor?.name ?? 'tu doctor';
    const message = `Tu cita con ${doctorName} del ${startTime.toISOString()} fue cancelada (aprobado por administracion).`;
    await Promise.all([
      this.email.send(patient.email, 'Cita cancelada', message).catch(logError),
      this.notifier.notify(message).catch(logError),
    ]);
  }

  private async broadcastAvailability(doctorId: string, date: string): Promise<void> {
    const blocking = await this.appointments.findBlockingByDoctorAndDate(doctorId, date);
    const availability = computeFreeSlots(blocking, date);
    await this.events.publish(`doctor:${doctorId}`, {
      type: 'room-updated',
      payload: { doctorId, availability },
    });
  }
}
