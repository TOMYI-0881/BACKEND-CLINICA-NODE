import express from 'express';
import request from 'supertest';
import { optionalAuthMiddleware } from '../../src/presentation/http/middlewares/auth.middleware';
import { TokenService } from '../../src/domain/ports/TokenService';

function buildApp(tokens: TokenService): express.Express {
  const app = express();
  app.get('/queue', optionalAuthMiddleware(tokens), (req, res) => {
    res.status(200).json({ user: req.user ?? null });
  });
  return app;
}

function makeTokens(): jest.Mocked<TokenService> {
  return { sign: jest.fn(), verify: jest.fn() };
}

describe('optionalAuthMiddleware', () => {
  it('sin header de autorizacion, sigue como anonimo (sin req.user, sin 401)', async () => {
    const tokens = makeTokens();
    const res = await request(buildApp(tokens)).get('/queue');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it('con un token valido, setea req.user', async () => {
    const tokens = makeTokens();
    tokens.verify.mockReturnValue({ userId: 'pat-1', role: 'PATIENT' });
    const res = await request(buildApp(tokens)).get('/queue').set('Authorization', 'Bearer valido');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { userId: 'pat-1', role: 'PATIENT' } });
  });

  it('con un token invalido/expirado, sigue como anonimo (nunca 401) -- la ruta es publica', async () => {
    const tokens = makeTokens();
    tokens.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const res = await request(buildApp(tokens)).get('/queue').set('Authorization', 'Bearer vencido');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });
});
