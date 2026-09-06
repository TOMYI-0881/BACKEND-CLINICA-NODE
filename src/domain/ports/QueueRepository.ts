import { Turn, TurnPriority } from '../entities/Turn';

export interface NewTurnData {
  doctorId: string;
  queueDate: string;
  appointmentId: string | null;
  patientName: string;
  priority: TurnPriority;
}

export interface QueueStatus {
  current: Turn | null;
  waiting: Turn[];
}

export interface TurnTransitionResult {
  finished: Turn | null;
  promoted: Turn | null;
}

/**
 * Puerto de persistencia de la cola de espera en vivo (seccion 9.7). La
 * implementacion Postgres es responsable de:
 *  - Asignar `number` de forma correlativa reintentando ante colision del
 *    indice unico (doctor_id, queue_date, number) si el lock de Redis no
 *    estuvo disponible (fail-open, seccion 9.2).
 *  - Ejecutar callNext/skip como una unica transaccion (marcar el turno
 *    actual + promover el siguiente), nunca como dos operaciones separadas,
 *    para que un fallo a mitad de camino no deje la cola sin turno
 *    in-progress ni con dos (garantia reforzada por idx_turns_one_in_progress).
 *  - Rechazar un segundo turno para la misma cita ya checkeada (idx_turns_one_per_appointment,
 *    agregado en la Fase 6): un doble check-in de la misma cita nunca debe crear dos
 *    turnos, sin importar la concurrencia.
 */
export interface QueueRepository {
  /** @throws ConflictError si `data.appointmentId` ya tiene un turno de cola generado. */
  checkIn(data: NewTurnData): Promise<Turn>;
  getStatus(doctorId: string, queueDate: string): Promise<QueueStatus>;
  findCurrent(doctorId: string, queueDate: string): Promise<Turn | null>;
  /** Marca el turno actual como 'done' y promueve el siguiente en una sola transaccion. */
  callNext(doctorId: string, queueDate: string): Promise<TurnTransitionResult>;
  /** Marca el turno actual como 'skipped' y promueve el siguiente en una sola transaccion. */
  skip(doctorId: string, queueDate: string): Promise<TurnTransitionResult>;
}
