import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { CustomError } from '../../../domain/errors/CustomError';
import { logger } from '../../../config/logger';

/** Mapea CustomError a su codigo HTTP; todo lo demas a 500 sin filtrar detalles internos. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof CustomError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Datos invalidos', details: err.issues });
    return;
  }

  logger.error({ err }, 'Error no manejado');
  res.status(500).json({ error: 'Error interno del servidor' });
}
