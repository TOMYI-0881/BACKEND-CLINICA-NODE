import { ValidationError } from '../errors/ValidationError';

export type CancellationRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CancellationRequestProps {
  id: string;
  appointmentId: string;
  requestedBy: string;
  reason: string;
  status: CancellationRequestStatus;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

/**
 * Pedido de un DOCTOR para cancelar una cita, sujeto a aprobacion de ADMIN
 * (seccion "Rol DOCTOR" de AI-CONTEXT.md). La garantia de que nunca haya dos pedidos
 * pendientes para la misma cita vive en la BD (idx_one_pending_request_per_appointment),
 * no en esta clase.
 */
export class CancellationRequest {
  private constructor(private readonly props: CancellationRequestProps) {}

  static create(props: CancellationRequestProps): CancellationRequest {
    if (!props.reason.trim()) {
      throw new ValidationError('El motivo de la cancelacion es obligatorio');
    }
    return new CancellationRequest(props);
  }

  get id(): string {
    return this.props.id;
  }

  get appointmentId(): string {
    return this.props.appointmentId;
  }

  get requestedBy(): string {
    return this.props.requestedBy;
  }

  get reason(): string {
    return this.props.reason;
  }

  get status(): CancellationRequestStatus {
    return this.props.status;
  }

  get resolvedBy(): string | null {
    return this.props.resolvedBy;
  }

  get resolvedAt(): Date | null {
    return this.props.resolvedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  isPending(): boolean {
    return this.props.status === 'pending';
  }

  toJSON(): CancellationRequestProps {
    return { ...this.props };
  }
}
