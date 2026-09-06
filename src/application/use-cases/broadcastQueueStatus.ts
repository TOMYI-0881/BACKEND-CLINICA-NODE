import { QueueRepository } from '../../domain/ports/QueueRepository';
import { EventPublisher } from '../../domain/ports/EventPublisher';

/** Reutilizado por CheckInPatient, CallNextTurn, SkipTurn y RecallCurrentTurn (seccion 7). */
export async function broadcastQueueStatus(
  events: EventPublisher,
  queues: QueueRepository,
  doctorId: string,
  queueDate: string,
): Promise<void> {
  const status = await queues.getStatus(doctorId, queueDate);
  await events.publish(`doctor:${doctorId}`, {
    type: 'queue-updated',
    payload: { doctorId, date: queueDate, currentTurn: status.current, waiting: status.waiting },
  });
}
