import { CustomError } from './CustomError';

/** Superposicion de horarios, doble reserva, o cualquier conflicto de estado unico en BD. */
export class ConflictError extends CustomError {
  readonly statusCode = 409;
}
