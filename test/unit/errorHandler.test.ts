import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/presentation/http/middlewares/errorHandler';
import { ConflictError } from '../../src/domain/errors/ConflictError';
import { NotFoundError } from '../../src/domain/errors/NotFoundError';
import { ValidationError } from '../../src/domain/errors/ValidationError';
import { UnauthorizedError } from '../../src/domain/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/domain/errors/ForbiddenError';

function buildAppThatThrows(err: unknown): express.Express {
  const app = express();
  app.get('/boom', (_req, _res) => {
    throw err;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it.each([
    [new ConflictError('conflicto'), 409],
    [new NotFoundError('no encontrado'), 404],
    [new ValidationError('invalido'), 400],
    [new UnauthorizedError('no autenticado'), 401],
    [new ForbiddenError('prohibido'), 403],
  ])('mapea %p al status HTTP %i', async (err, expectedStatus) => {
    const app = buildAppThatThrows(err);
    const res = await request(app).get('/boom');
    expect(res.status).toBe(expectedStatus);
    expect(res.body).toEqual({ error: (err as Error).message });
  });

  it('mapea cualquier error no reconocido a 500 sin filtrar detalles internos', async () => {
    const app = buildAppThatThrows(new Error('detalle interno sensible: password=1234'));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify(res.body)).not.toContain('password=1234');
  });
});
