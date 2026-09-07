import { ValidationError } from '../errors/ValidationError';

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED' | 'CANCELLATION_REQUESTED' | 'COMPLETED';

export interface AppointmentProps {
  id: string;
  doctorId: string;
  patientId: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  createdAt: Date;
  patientEmail?: string;
}

const VALID_STATUSES: AppointmentStatus[] = ['CONFIRMED', 'CANCELLED', 'CANCELLATION_REQUESTED', 'COMPLETED'];

export class Appointment {
  private constructor(private readonly props: AppointmentProps) {}

  static create(props: AppointmentProps): Appointment {
    if (props.endTime.getTime() <= props.startTime.getTime()) {
      throw new ValidationError('endTime debe ser posterior a startTime');
    }
    if (!VALID_STATUSES.includes(props.status)) {
      throw new ValidationError('Estado de reserva invalido');
    }
    return new Appointment(props);
  }

  get id(): string {
    return this.props.id;
  }

  get doctorId(): string {
    return this.props.doctorId;
  }

  get patientId(): string {
    return this.props.patientId;
  }

  get startTime(): Date {
    return this.props.startTime;
  }

  get endTime(): Date {
    return this.props.endTime;
  }

  get status(): AppointmentStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get patientEmail(): string | undefined {
    return this.props.patientEmail;
  }

  isConfirmed(): boolean {
    return this.props.status === 'CONFIRMED';
  }

  belongsTo(patientId: string): boolean {
    return this.props.patientId === patientId;
  }

  belongsToDoctor(doctorId: string): boolean {
    return this.props.doctorId === doctorId;
  }

  /** Cancelacion directa (ADMIN, o aprobacion de un pedido de DOCTOR). */
  cancel(): Appointment {
    return new Appointment({ ...this.props, status: 'CANCELLED' });
  }

  /**
   * Un DOCTOR pide cancelar -- la cita queda bloqueada (no CANCELLED todavia) hasta que
   * ADMIN la resuelva. Solo valida desde CONFIRMED: no tiene sentido pedir cancelar algo
   * ya cancelado, ni duplicar un pedido sobre una cita que ya tiene uno pendiente (esa
   * segunda garantia la impone el indice unico parcial de la BD, no esta clase).
   */
  requestCancellation(): Appointment {
    if (this.props.status !== 'CONFIRMED') {
      throw new ValidationError('Solo se puede pedir la cancelacion de una cita CONFIRMED');
    }
    return new Appointment({ ...this.props, status: 'CANCELLATION_REQUESTED' });
  }

  /** ADMIN aprueba el pedido del doctor: la cita se cancela de verdad. */
  approveCancellation(): Appointment {
    if (this.props.status !== 'CANCELLATION_REQUESTED') {
      throw new ValidationError('No hay un pedido de cancelacion pendiente para aprobar');
    }
    return new Appointment({ ...this.props, status: 'CANCELLED' });
  }

  /** ADMIN rechaza el pedido del doctor: la cita vuelve a estar confirmada. */
  rejectCancellation(): Appointment {
    if (this.props.status !== 'CANCELLATION_REQUESTED') {
      throw new ValidationError('No hay un pedido de cancelacion pendiente para rechazar');
    }
    return new Appointment({ ...this.props, status: 'CONFIRMED' });
  }

  overlapsWith(startTime: Date, endTime: Date): boolean {
    // Semantica [start, end): igual a la del tsrange por defecto en Postgres.
    return this.props.startTime.getTime() < endTime.getTime() && startTime.getTime() < this.props.endTime.getTime();
  }

  toJSON(): AppointmentProps {
    return { ...this.props };
  }
}
