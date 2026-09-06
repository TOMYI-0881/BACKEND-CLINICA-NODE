import { CustomError } from './CustomError';

export class NotFoundError extends CustomError {
  readonly statusCode = 404;
}
