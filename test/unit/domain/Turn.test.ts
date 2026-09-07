import { Turn, TurnQueue, TurnProps } from '../../../src/domain/entities/Turn';
import { ValidationError } from '../../../src/domain/errors/ValidationError';

function makeTurn(overrides: Partial<TurnProps>): Turn {
  return Turn.create({
    id: overrides.id ?? 'turn-1',
    doctorId: 'doc-1',
    appointmentId: null,
    queueDate: '2026-01-01',
    number: overrides.number ?? 1,
    patientName: overrides.patientName ?? 'Paciente',
    priority: overrides.priority ?? 'normal',
    status: overrides.status ?? 'waiting',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T08:00:00Z'),
    finishedAt: overrides.finishedAt ?? null,
    photoUrl: overrides.photoUrl ?? null,
  });
}

describe('Turn (entidad)', () => {
  it('rechaza patientName vacio', () => {
    expect(() => makeTurn({ patientName: '  ' })).toThrow(ValidationError);
  });

  it('rechaza number <= 0', () => {
    expect(() => makeTurn({ number: 0 })).toThrow(ValidationError);
  });

  it('markInProgress solo desde waiting', () => {
    const inProgress = makeTurn({ status: 'in-progress' });
    expect(() => inProgress.markInProgress()).toThrow(ValidationError);

    const waiting = makeTurn({ status: 'waiting' });
    expect(waiting.markInProgress().status).toBe('in-progress');
  });

  it('markDone/markSkipped solo desde in-progress', () => {
    const waiting = makeTurn({ status: 'waiting' });
    expect(() => waiting.markDone(new Date())).toThrow(ValidationError);
    expect(() => waiting.markSkipped(new Date())).toThrow(ValidationError);

    const inProgress = makeTurn({ status: 'in-progress' });
    expect(inProgress.markDone(new Date()).status).toBe('done');
  });
});

describe('TurnQueue (regla de prioridad)', () => {
  it('promueve al turno preferente antes que a los normales creados primero', () => {
    // 3 turnos normales (numeros 1, 2, 3) y luego 1 preferente (numero 4, creado despues).
    const t1 = makeTurn({ id: 't1', number: 1, priority: 'normal' });
    const t2 = makeTurn({ id: 't2', number: 2, priority: 'normal' });
    const t3 = makeTurn({ id: 't3', number: 3, priority: 'normal' });
    const t4 = makeTurn({ id: 't4', number: 4, priority: 'preferente' });

    const queue = new TurnQueue([t1, t2, t3, t4]);
    const promotedQueue = queue.promoteNext();

    expect(promotedQueue.current?.id).toBe('t4');
  });

  it('dentro de la misma prioridad respeta orden FIFO por number', () => {
    const t2 = makeTurn({ id: 't2', number: 2, priority: 'normal' });
    const t1 = makeTurn({ id: 't1', number: 1, priority: 'normal' });

    const queue = new TurnQueue([t2, t1]);
    expect(queue.peekNext()?.id).toBe('t1');
  });

  it('nextNumber() calcula el siguiente correlativo', () => {
    const queue = new TurnQueue([makeTurn({ id: 't1', number: 1 }), makeTurn({ id: 't2', number: 5 })]);
    expect(queue.nextNumber()).toBe(6);
    expect(new TurnQueue().nextNumber()).toBe(1);
  });

  it('finishCurrent marca done y promueve el siguiente respetando prioridad', () => {
    const current = makeTurn({ id: 'cur', number: 1, status: 'in-progress' });
    const normal = makeTurn({ id: 'n1', number: 2, priority: 'normal' });
    const preferente = makeTurn({ id: 'p1', number: 3, priority: 'preferente' });

    const queue = new TurnQueue([current, normal, preferente]);
    const next = queue.finishCurrent(new Date());

    const finished = next.all.find((t) => t.id === 'cur');
    expect(finished?.status).toBe('done');
    expect(next.current?.id).toBe('p1');
  });

  it('skipCurrent marca skipped y promueve el siguiente', () => {
    const current = makeTurn({ id: 'cur', number: 1, status: 'in-progress' });
    const normal = makeTurn({ id: 'n1', number: 2, priority: 'normal' });

    const queue = new TurnQueue([current, normal]);
    const next = queue.skipCurrent(new Date());

    const skipped = next.all.find((t) => t.id === 'cur');
    expect(skipped?.status).toBe('skipped');
    expect(next.current?.id).toBe('n1');
  });

  it('promoteNext es no-op si ya hay un turno in-progress', () => {
    const current = makeTurn({ id: 'cur', number: 1, status: 'in-progress' });
    const waiting = makeTurn({ id: 'w1', number: 2, priority: 'preferente' });

    const queue = new TurnQueue([current, waiting]);
    const result = queue.promoteNext();

    expect(result.current?.id).toBe('cur');
    expect(result.waiting).toHaveLength(1);
  });

  it('finishCurrent promueve el siguiente incluso si no habia turno en curso', () => {
    const waiting = makeTurn({ id: 'w1', number: 1, priority: 'normal' });
    const preferente = makeTurn({ id: 'w2', number: 2, priority: 'preferente' });

    const queue = new TurnQueue([waiting, preferente]);
    const result = queue.finishCurrent(new Date());

    expect(result.current?.id).toBe('w2');
  });

  it('skipCurrent promueve el siguiente incluso si no habia turno en curso', () => {
    const waiting = makeTurn({ id: 'w1', number: 1, priority: 'normal' });

    const queue = new TurnQueue([waiting]);
    const result = queue.skipCurrent(new Date());

    expect(result.current?.id).toBe('w1');
  });
});
