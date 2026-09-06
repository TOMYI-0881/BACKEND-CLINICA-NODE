import { CancellationRequest } from '../../domain/entities/CancellationRequest';
import { AppointmentCancellationRequestRepository } from '../../domain/ports/AppointmentCancellationRequestRepository';

export class ListPendingCancellationRequests {
  constructor(private readonly cancellationRequests: AppointmentCancellationRequestRepository) {}

  async execute(): Promise<CancellationRequest[]> {
    return this.cancellationRequests.findAllPending();
  }
}
