import { RequestHandler } from 'express';
import { AppContainer } from '../../src/config/di';
import { TokenService } from '../../src/domain/ports/TokenService';

const ok: RequestHandler = (_req, res) => res.status(200).json({ ok: true });

/** Contenedor con controladores/tokens stub, para testear app.ts/rutas sin infraestructura real. */
export function buildFakeContainer(overrides: Partial<AppContainer> = {}): AppContainer {
  const tokens: TokenService = { sign: () => 'fake-token', verify: () => ({ userId: 'u1', role: 'ADMIN' }) };

  return {
    pgPool: {} as AppContainer['pgPool'],
    redis: {} as AppContainer['redis'],
    redisSubscriberConnection: {} as AppContainer['redisSubscriberConnection'],
    tokens,
    repositories: {
      users: {} as AppContainer['repositories']['users'],
      doctors: {} as AppContainer['repositories']['doctors'],
      appointments: {} as AppContainer['repositories']['appointments'],
      queues: {} as AppContainer['repositories']['queues'],
      cancellationRequests: {} as AppContainer['repositories']['cancellationRequests'],
    },
    controllers: {
      auth: { register: ok, login: ok, me: ok, updateProfile: ok, uploadPhoto: ok, removePhoto: ok },
      doctors: { create: ok, list: ok, update: ok, deactivate: ok, resetPassword: ok, uploadPhoto: ok, removePhoto: ok },
      appointments: { availability: ok, create: ok, mine: ok, list: ok, cancel: ok, requestCancellation: ok },
      queues: { checkIn: ok, status: ok, next: ok, skip: ok, call: ok },
      cancellationRequests: { list: ok, approve: ok, reject: ok },
      webhooks: { github: ok },
      health: { health: (_req, res) => res.status(200).json({ status: 'ok' }) },
    },
    ...overrides,
  };
}
