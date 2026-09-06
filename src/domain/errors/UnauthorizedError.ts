import { CustomError } from './CustomError';

/** Credenciales invalidas o token ausente/invalido (401). */
export class UnauthorizedError extends CustomError {
  readonly statusCode = 401;
}
