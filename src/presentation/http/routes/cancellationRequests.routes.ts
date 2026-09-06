import { Router } from 'express';
import { CancellationRequestsController } from '../controllers/cancellationRequests.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/roles.middleware';
import { TokenService } from '../../../domain/ports/TokenService';

/**
 * @openapi
 * /cancellation-requests:
 *   get:
 *     summary: Lista los pedidos de cancelacion pendientes (ADMIN)
 *     tags: [CancellationRequests]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de pedidos pendientes }
 * /cancellation-requests/{id}/approve:
 *   post:
 *     summary: Aprueba el pedido -- la cita se cancela y se notifica al paciente (ADMIN)
 *     tags: [CancellationRequests]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Pedido aprobado }
 *       400: { description: El pedido ya fue resuelto }
 *       404: { description: Pedido no encontrado }
 * /cancellation-requests/{id}/reject:
 *   post:
 *     summary: Rechaza el pedido -- la cita vuelve a CONFIRMED (ADMIN)
 *     tags: [CancellationRequests]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Pedido rechazado }
 *       400: { description: El pedido ya fue resuelto }
 *       404: { description: Pedido no encontrado }
 */
export function buildCancellationRequestsRoutes(
  controller: CancellationRequestsController,
  tokens: TokenService,
): Router {
  const router = Router();
  const admin = [authMiddleware(tokens), requireRole('ADMIN')];

  router.get('/', ...admin, controller.list);
  router.post('/:id/approve', ...admin, controller.approve);
  router.post('/:id/reject', ...admin, controller.reject);

  return router;
}
