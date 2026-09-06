import { CustomError } from './CustomError';

/**
 * Token valido pero rol insuficiente para la operacion (403).
 * No forma parte de la lista original de errores del documento maestro (seccion 4),
 * pero es necesaria: la seccion 6 exige distinguir 401 (sin JWT) de 403 (rol incorrecto),
 * y un unico UnauthorizedError no puede representar ambos casos con semantica HTTP correcta.
 */
export class ForbiddenError extends CustomError {
  readonly statusCode = 403;
}
