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

/**
 * Version "soft" de authMiddleware para rutas publicas que quieren enriquecer la respuesta
 * si el caller esta logueado (ej. GET /queues/:doctorId -> myTurn), sin dejar de ser publicas.
 * Sin header: sigue anonimo. Header invalido/expirado: tambien sigue anonimo (nunca 401) --
 * la ruta es publica, un token vencido no deberia romper la funcionalidad base.
 */
export function optionalAuthMiddleware(tokens: TokenService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      next();
      return;
    }

    const token = header.slice(BEARER_PREFIX.length);
    try {
      req.user = tokens.verify(token);
    } catch {
      // token invalido/expirado: se ignora, la request sigue como anonima.
    }
    next();
  };
}
