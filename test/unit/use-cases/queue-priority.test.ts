import { CallNextTurn } from '../../../src/application/use-cases/CallNextTurn';
import { Turn, TurnQueue } from '../../../src/domain/entities/Turn';
import { QueueRepository, QueueStatus, TurnTransitionResult, NewTurnData } from '../../../src/domain/ports/QueueRepository';
import { makeEventPublisher } from './mocks';

/**
 * Fake de QueueRepository respaldado por la logica pura TurnQueue (Fase 1), no por
 * Postgres. Prueba que el caso de uso CallNextTurn delega correctamente en un
 * repositorio que respeta la regla de prioridad, sin necesidad de infraestructura real
 * (esa garantia con Postgres real ya esta cubierta en la Fase 2).
 */
class InMemoryQueueRepository implements QueueRepository {
  private queue = new TurnQueue();

  seed(turns: Turn[]): void {
    this.queue = new TurnQueue(turns);
  }

  async checkIn(_data: NewTurnData): Promise<Turn> {
    throw new Error('no usado en este test');
  }

  async getStatus(): Promise<QueueStatus> {
    return { current: this.queue.current, waiting: this.queue.waiting };
  }

  async findCurrent(): Promise<Turn | null> {
    return this.queue.current;
  }

  async callNext(): Promise<TurnTransitionResult> {
    const before = this.queue.current;
    this.queue = this.queue.finishCurrent(new Date());
    return { finished: before, promoted: this.queue.current };
  }

  async skip(): Promise<TurnTransitionResult> {
    const before = this.queue.current;
    this.queue = this.queue.skipCurrent(new Date());
    return { finished: before, promoted: this.queue.current };
  }
}

function makeTurn(id: string, number: number, priority: 'normal' | 'preferente'): Turn {
  return Turn.create({
    id,
    doctorId: 'doc-1',
    appointmentId: null,
    queueDate: '2026-03-01',
    number,
    patientName: `Paciente ${number}`,
    priority,
    status: 'waiting',
    createdAt: new Date(),
    finishedAt: null,
  });
}

describe('CallNextTurn (via QueueRepository) respeta la prioridad preferente', () => {
  it('promueve al turno preferente antes que a normales creados primero', async () => {
    const repo = new InMemoryQueueRepository();
    repo.seed([
      makeTurn('t1', 1, 'normal'),
      makeTurn('t2', 2, 'normal'),
      makeTurn('t3', 3, 'normal'),
      makeTurn('t4', 4, 'preferente'),
    ]);

    const useCase = new CallNextTurn(repo, makeEventPublisher());
    const result = await useCase.execute('doc-1', '2026-03-01');

    expect(result.finished).toBeNull();
    expect(result.promoted?.id).toBe('t4');
  });
});
