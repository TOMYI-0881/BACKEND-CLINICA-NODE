import { CancellationRequest } from '../../domain/entities/CancellationRequest';
import { AppointmentCancellationRequestRepository } from '../../domain/ports/AppointmentCancellationRequestRepository';

/** ADMIN rechaza el pedido: la cita vuelve a CONFIRMED. Sin notificar al paciente (nada cambio para el). */
export class RejectCancellationRequest {
  constructor(private readonly cancellationRequests: AppointmentCancellationRequestRepository) {}

  async execute(requestId: string, adminUserId: string): Promise<CancellationRequest> {
    return this.cancellationRequests.resolve(requestId, 'rejected', adminUserId);
  }
}
