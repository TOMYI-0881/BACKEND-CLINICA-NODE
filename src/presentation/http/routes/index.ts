import express, { Router } from 'express';
import { AppContainer } from '../../../config/di';
import { buildAuthRoutes } from './auth.routes';
import { buildDoctorsRoutes } from './doctors.routes';
import { buildAppointmentsRoutes } from './appointments.routes';
import { buildQueuesRoutes } from './queues.routes';
import { buildCancellationRequestsRoutes } from './cancellationRequests.routes';
import { buildAdminRoutes } from './admin.routes';
import { buildWebhooksRoutes } from './webhooks.routes';
import { env } from '../../../config/env';

/**
 * Rutas de recursos de negocio, montadas bajo /api (seccion 6). `/health` y
 * `/api-docs` se montan aparte, a nivel raiz (app.ts): son endpoints de
 * infraestructura/operabilidad (healthchecks de Docker, documentacion), no
 * recursos versionables de la API -- por eso no llevan el prefijo /api.
 */
export function buildApiRouter(container: AppContainer): Router {
  const router = Router();
  // express.json() se aplica por sub-router, NUNCA global: /webhooks/github necesita
  // el Buffer crudo del body para verificar la firma HMAC (ver webhooks.routes.ts).
  const jsonBody = express.json();

  router.use('/auth', jsonBody, buildAuthRoutes(container.controllers.auth, container.tokens));
  router.use('/doctors', jsonBody, buildDoctorsRoutes(container.controllers.doctors, container.tokens));
  router.use(
    '/appointments',
    jsonBody,
    buildAppointmentsRoutes(container.controllers.appointments, container.tokens),
  );
  router.use(
    '/queues',
    jsonBody,
    buildQueuesRoutes(container.controllers.queues, container.tokens, container.repositories.doctors),
  );
  router.use(
    '/cancellation-requests',
    jsonBody,
    buildCancellationRequestsRoutes(container.controllers.cancellationRequests, container.tokens),
  );
  router.use('/admin', jsonBody, buildAdminRoutes(container.controllers.admin, container.tokens));
  router.use('/webhooks', buildWebhooksRoutes(container.controllers.webhooks, env.githubWebhookSecret));

  return router;
}
