import { QueueRepository, QueueStatus } from '../../domain/ports/QueueRepository';

export class GetQueueStatus {
  constructor(private readonly queues: QueueRepository) {}

  async execute(doctorId: string, queueDate: string): Promise<QueueStatus> {
    return this.queues.getStatus(doctorId, queueDate);
  }
}
