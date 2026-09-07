import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/roles.middleware';
import { TokenService } from '../../../domain/ports/TokenService';

/** @openapi
 *  /admin/dashboard/stats:
 *    get:
 *      summary: Metricas agregadas del dashboard (ADMIN)
 *      tags: [Admin]
 *      security: [{ bearerAuth: [] }]
 *      responses:
 *        200: { description: Estadisticas del sistema }
 *        403: { description: Requiere rol ADMIN }
 */
export function buildAdminRoutes(controller: AdminController, tokens: TokenService): Router {
  const router = Router();
  const auth = authMiddleware(tokens);
  router.get('/dashboard/stats', auth, requireRole('ADMIN'), controller.dashboardStats);
  return router;
}
