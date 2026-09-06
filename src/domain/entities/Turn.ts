import { ValidationError } from '../errors/ValidationError';

export type TurnPriority = 'normal' | 'preferente';
export type TurnStatus = 'waiting' | 'in-progress' | 'done' | 'skipped';

export interface TurnProps {
  id: string;
  doctorId: string;
  appointmentId: string | null;
  queueDate: string;
  number: number;
  patientName: string;
  priority: TurnPriority;
  status: TurnStatus;
  createdAt: Date;
  finishedAt: Date | null;
}

/**
 * Entidad pura del turno de cola. No conoce Postgres, Redis ni WebSocket:
 * toda su logica es sincrona y testeable con datos en memoria.
 */
export class Turn {
  private constructor(private readonly props: TurnProps) {}

  static create(props: TurnProps): Turn {
    if (!props.patientName.trim()) {
      throw new ValidationError('El turno debe tener el nombre del paciente');
    }
    if (props.number <= 0) {
      throw new ValidationError('El numero de turno debe ser positivo');
    }
    return new Turn(props);
  }

  get id(): string {
    return this.props.id;
  }

  get doctorId(): string {
    return this.props.doctorId;
  }

  get appointmentId(): string | null {
    return this.props.appointmentId;
  }

  get queueDate(): string {
    return this.props.queueDate;
  }

  get number(): number {
    return this.props.number;
  }

  get patientName(): string {
    return this.props.patientName;
  }

  get priority(): TurnPriority {
    return this.props.priority;
  }

  get status(): TurnStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get finishedAt(): Date | null {
    return this.props.finishedAt;
  }

  markInProgress(): Turn {
    if (this.props.status !== 'waiting') {
      throw new ValidationError('Solo un turno en espera puede pasar a en-curso');
    }
    return new Turn({ ...this.props, status: 'in-progress' });
  }

  markDone(finishedAt: Date): Turn {
    if (this.props.status !== 'in-progress') {
      throw new ValidationError('Solo un turno en curso puede marcarse como atendido');
    }
    return new Turn({ ...this.props, status: 'done', finishedAt });
  }

  markSkipped(finishedAt: Date): Turn {
    if (this.props.status !== 'in-progress') {
      throw new ValidationError('Solo un turno en curso puede saltarse');
    }
    return new Turn({ ...this.props, status: 'skipped', finishedAt });
  }

  toJSON(): TurnProps {
    return { ...this.props };
  }
}

/**
 * Logica de dominio pura para el orden de atencion de la cola de un doctor en un dia dado.
 * Regla de prioridad: 'preferente' se atiende antes que 'normal'; dentro de la misma
 * prioridad, orden FIFO por 'number'.
 */
export class TurnQueue {
  constructor(private readonly turns: ReadonlyArray<Turn> = []) {}

  get all(): ReadonlyArray<Turn> {
    return this.turns;
  }

  get waiting(): Turn[] {
    return this.turns.filter((t) => t.status === 'waiting');
  }

  get current(): Turn | null {
    return this.turns.find((t) => t.status === 'in-progress') ?? null;
  }

  nextNumber(): number {
    if (this.turns.length === 0) return 1;
    return Math.max(...this.turns.map((t) => t.number)) + 1;
  }

  withAdded(turn: Turn): TurnQueue {
    return new TurnQueue([...this.turns, turn]);
  }

  /** Siguiente turno a atender segun la regla de prioridad, sin mutar estado. */
  peekNext(): Turn | null {
    const sorted = [...this.waiting].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === 'preferente' ? -1 : 1;
      }
      return a.number - b.number;
    });
    return sorted[0] ?? null;
  }

  /** Promueve el siguiente turno en espera a 'in-progress'. No-op si ya hay uno en curso o no hay espera. */
  promoteNext(): TurnQueue {
    if (this.current) return this;
    const next = this.peekNext();
    if (!next) return this;
    const updated = this.turns.map((t) => (t.id === next.id ? t.markInProgress() : t));
    return new TurnQueue(updated);
  }

  /**
   * Marca el turno en curso como atendido y promueve el siguiente. Si no hay
   * turno en curso (ej. primer "next" del dia, cuando todos estan en espera
   * todavia), igual intenta promover -- mismo comportamiento que
   * PostgresQueueRepository.callNext (seccion 9.7): finalizar el actual y
   * promover el siguiente son pasos independientes, el segundo no depende de
   * que el primero haya encontrado algo.
   */
  finishCurrent(finishedAt: Date): TurnQueue {
    const current = this.current;
    if (!current) return this.promoteNext();
    const updated = this.turns.map((t) => (t.id === current.id ? t.markDone(finishedAt) : t));
    return new TurnQueue(updated).promoteNext();
  }

  /** Marca el turno en curso como saltado y promueve el siguiente. Ver nota de finishCurrent. */
  skipCurrent(finishedAt: Date): TurnQueue {
    const current = this.current;
    if (!current) return this.promoteNext();
    const updated = this.turns.map((t) => (t.id === current.id ? t.markSkipped(finishedAt) : t));
    return new TurnQueue(updated).promoteNext();
  }
}
