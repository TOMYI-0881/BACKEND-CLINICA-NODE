import express, { Express } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { AppContainer } from './config/di';
import { swaggerSpec } from './config/swagger';
import { logger } from './config/logger';
import { env } from './config/env';
import { globalRateLimiter } from './presentation/http/middlewares/rateLimit.middleware';
import { errorHandler } from './presentation/http/middlewares/errorHandler';
import { buildHealthRoutes } from './presentation/http/routes/health.routes';
import { buildApiRouter } from './presentation/http/routes';
import './presentation/http/types';

export function createApp(container: AppContainer): Express {
  const app = express();

  // CORS: sin esto, cualquier frontend en otro origen (localhost:5173, etc.) es bloqueado
  // por el navegador antes de que la request llegue a la API. Bearer tokens (no cookies),
  // asi que reflejar el origen es seguro -- no hay CSRF que mitigar con credentials.
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',').map((origin) => origin.trim()),
    }),
  );

  app.use(
    pinoHttp({
      logger,
      // Los healthchecks de Docker pegan cada pocos segundos: loguearlos es puro ruido.
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.use('/health', buildHealthRoutes(container.controllers.health));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  const apiRouter = buildApiRouter(container);
  app.use('/api', globalRateLimiter, apiRouter);

  app.use(errorHandler);

  return app;
}
