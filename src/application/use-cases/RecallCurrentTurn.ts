import { Turn } from '../../domain/entities/Turn';
import { QueueRepository } from '../../domain/ports/QueueRepository';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { NotFoundError } from '../../domain/errors/NotFoundError';
import { logError } from '../logError';
import { broadcastQueueStatus } from './broadcastQueueStatus';

/** Re-anuncia el turno en curso sin cambiar su estado (POST /queues/:doctorId/call). */
export class RecallCurrentTurn {
  constructor(
    private readonly queues: QueueRepository,
    private readonly events: EventPublisher,
  ) {}

  async execute(doctorId: string, queueDate: string): Promise<Turn> {
    const current = await this.queues.findCurrent(doctorId, queueDate);
    if (!current) {
      throw new NotFoundError('No hay turno en curso para este doctor');
    }

    broadcastQueueStatus(this.events, this.queues, doctorId, queueDate).catch(logError);

    return current;
  }
}
