import { Doctor } from '../../domain/entities/Doctor';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { NotificationService } from '../../domain/ports/NotificationService';
import { EmailService } from '../../domain/ports/EmailService';
import { computeFreeSlots } from '../../domain/entities/Availability';
import { logError } from '../logError';

/**
 * "Borrar" un doctor nunca es un DELETE real (appointments/turns lo referencian con
 * ON DELETE NO ACTION) -- es un soft-delete que ademas cancela en cascada sus citas
 * futuras confirmadas y notifica a cada paciente afectado (email + Discord). Ver
 * AI-CONTEXT.md, seccion "Rol DOCTOR".
 */
export class DeactivateDoctor {
  constructor(
    private readonly doctors: DoctorRepository,
    private readonly appointments: AppointmentRepository,
    private readonly users: UserRepository,
    private readonly events: EventPublisher,
    private readonly notifier: NotificationService,
    private readonly email: EmailService,
  ) {}

  async execute(doctorId: string): Promise<Doctor> {
    const doctor = await this.doctors.deactivate(doctorId);

    const futureAppointments = await this.appointments.findFutureConfirmedByDoctor(doctorId, new Date());
    const affectedDates = new Set<string>();

    for (const appointment of futureAppointments) {
      const cancelled = await this.appointments.cancel(appointment.id);
      affectedDates.add(cancelled.startTime.toISOString().slice(0, 10));
      this.notifyPatient(cancelled.patientId, doctor.name, cancelled.startTime).catch(logError);
    }

    for (const date of affectedDates) {
      this.broadcastAvailability(doctorId, date).catch(logError);
    }

    return doctor;
  }

  private async notifyPatient(patientId: string, doctorName: string, startTime: Date): Promise<void> {
    const patient = await this.users.findById(patientId);
    if (!patient) return;

    const message = `Tu cita con ${doctorName} del ${startTime.toISOString()} fue cancelada porque el doctor ya no esta disponible.`;
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
