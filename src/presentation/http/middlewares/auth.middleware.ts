import { NextFunction, Request, RequestHandler, Response } from 'express';
import { TokenService } from '../../../domain/ports/TokenService';
import { UnauthorizedError } from '../../../domain/errors/UnauthorizedError';

const BEARER_PREFIX = 'Bearer ';

/** Verifica el JWT y rellena req.user tipado (nunca req.body.user, seccion 9.5). */
export function authMiddleware(tokens: TokenService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      next(new UnauthorizedError('Token no provisto'));
      return;
    }

    const token = header.slice(BEARER_PREFIX.length);
    try {
      req.user = tokens.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}
