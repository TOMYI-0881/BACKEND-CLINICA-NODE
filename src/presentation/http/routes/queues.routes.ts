import { Router } from 'express';
import { QueuesController } from '../controllers/queues.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdminOrOwnDoctor } from '../middlewares/roles.middleware';
import { TokenService } from '../../../domain/ports/TokenService';
import { DoctorRepository } from '../../../domain/ports/DoctorRepository';

/**
 * @openapi
 * /queues/{doctorId}/check-in:
 *   post:
 *     summary: Registra un turno en la cola del dia (appointmentId opcional, priority opcional)
 *     tags: [Queues]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201: { description: Turno creado }
 * /queues/{doctorId}:
 *   get:
 *     summary: Estado actual de la cola (turno en curso + lista de espera)
 *     tags: [Queues]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         schema: { type: string, example: 2026-03-01 }
 *     responses:
 *       200: { description: Estado de la cola }
 * /queues/{doctorId}/next:
 *   post:
 *     summary: Marca el turno en curso como done y promueve el siguiente (ADMIN o el propio DOCTOR)
 *     tags: [Queues]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Transicion realizada }
 * /queues/{doctorId}/skip:
 *   post:
 *     summary: Marca el turno en curso como skipped y promueve el siguiente (ADMIN o el propio DOCTOR)
 *     tags: [Queues]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Transicion realizada }
 * /queues/{doctorId}/call:
 *   post:
 *     summary: Re-anuncia el turno en curso por WebSocket, sin cambiar estado (ADMIN o el propio DOCTOR)
 *     tags: [Queues]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Turno actual re-anunciado }
 *       404: { description: No hay turno en curso }
 */
export function buildQueuesRoutes(
  controller: QueuesController,
  tokens: TokenService,
  doctors: DoctorRepository,
): Router {
  const router = Router();
  const auth = authMiddleware(tokens);
  const ownQueue = requireAdminOrOwnDoctor(doctors);
  const checkInAccess = requireAdminOrOwnDoctor(doctors, ['PATIENT']);

  router.post('/:doctorId/check-in', auth, checkInAccess, controller.checkIn);
  router.get('/:doctorId', controller.status);
  router.post('/:doctorId/next', auth, ownQueue, controller.next);
  router.post('/:doctorId/skip', auth, ownQueue, controller.skip);
  router.post('/:doctorId/call', auth, ownQueue, controller.call);

  return router;
}
