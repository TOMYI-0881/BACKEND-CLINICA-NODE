import { CustomError } from './CustomError';

export class ValidationError extends CustomError {
  readonly statusCode = 400;
}
