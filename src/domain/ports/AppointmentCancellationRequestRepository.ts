import { CancellationRequest, CancellationRequestStatus } from '../entities/CancellationRequest';

export interface NewCancellationRequestData {
  appointmentId: string;
  requestedBy: string;
  reason: string;
}

/**
 * Puerto de persistencia de pedidos de cancelacion de un DOCTOR. La garantia de "nunca dos
 * pedidos pendientes para la misma cita" vive en idx_one_pending_request_per_appointment
 * (indice unico parcial), no en el codigo de aplicacion.
 */
export interface AppointmentCancellationRequestRepository {
  /** @throws ConflictError si ya existe un pedido 'pending' para esa cita. */
  create(data: NewCancellationRequestData): Promise<CancellationRequest>;
  findById(id: string): Promise<CancellationRequest | null>;
  findAllPending(): Promise<CancellationRequest[]>;
  /** @throws NotFoundError si no existe. @throws ValidationError si ya fue resuelto. */
  resolve(id: string, status: Exclude<CancellationRequestStatus, 'pending'>, resolvedBy: string): Promise<CancellationRequest>;
}
