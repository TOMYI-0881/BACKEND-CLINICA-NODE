import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verifica conectividad real a Postgres y Redis
 *     tags: [Health]
 *     responses:
 *       200: { description: Todos los servicios responden }
 *       503: { description: Alguna dependencia no responde }
 */
export function buildHealthRoutes(controller: HealthController): Router {
  const router = Router();
  router.get('/', controller.health);
  return router;
}
