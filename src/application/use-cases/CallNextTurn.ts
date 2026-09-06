import { QueueRepository, TurnTransitionResult } from '../../domain/ports/QueueRepository';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { logError } from '../logError';
import { broadcastQueueStatus } from './broadcastQueueStatus';

export class CallNextTurn {
  constructor(
    private readonly queues: QueueRepository,
    private readonly events: EventPublisher,
  ) {}

  async execute(doctorId: string, queueDate: string): Promise<TurnTransitionResult> {
    const result = await this.queues.callNext(doctorId, queueDate);
    broadcastQueueStatus(this.events, this.queues, doctorId, queueDate).catch(logError);
    return result;
  }
}
