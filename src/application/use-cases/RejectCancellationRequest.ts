import { CancellationRequest } from '../../domain/entities/CancellationRequest';
import { AppointmentCancellationRequestRepository } from '../../domain/ports/AppointmentCancellationRequestRepository';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { QueueRepository } from '../../domain/ports/QueueRepository';
import { broadcastQueueStatus } from './broadcastQueueStatus';
import { logError } from '../logError';

/** ADMIN rechaza el pedido: la cita vuelve a CONFIRMED. Sin notificar al paciente (nada cambio para el). */
export class RejectCancellationRequest {
  constructor(
    private readonly cancellationRequests: AppointmentCancellationRequestRepository,
    private readonly appointments: AppointmentRepository,
    private readonly events: EventPublisher,
    private readonly queues: QueueRepository,
  ) {}

  async execute(requestId: string, adminUserId: string): Promise<CancellationRequest> {
    const resolved = await this.cancellationRequests.resolve(requestId, 'rejected', adminUserId);

    // La cita vuelve a CONFIRMED: su turno de cola (si lo tenia) reaparece en la espera
    // en vivo (ver filtro en PostgresQueueRepository.getStatus).
    const appointment = await this.appointments.findById(resolved.appointmentId);
    if (appointment) {
      const date = appointment.startTime.toISOString().slice(0, 10);
      broadcastQueueStatus(this.events, this.queues, appointment.doctorId, date).catch(logError);
    }

    return resolved;
  }
}
