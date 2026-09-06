import { Router } from 'express';
import { AppointmentsController } from '../controllers/appointments.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/roles.middleware';
import { TokenService } from '../../../domain/ports/TokenService';

/**
 * @openapi
 * /appointments/availability:
 *   get:
 *     summary: Devuelve los huecos libres de un doctor en un dia
 *     tags: [Appointments]
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, example: 2026-03-01 }
 *     responses:
 *       200: { description: Lista de slots libres }
 * /appointments:
 *   post:
 *     summary: Crea una reserva para el usuario autenticado
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Reserva creada }
 *       409: { description: Horario ya reservado }
 *   get:
 *     summary: Lista todas las reservas (ADMIN, paginado)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Listado paginado }
 *       403: { description: Requiere rol ADMIN }
 * /appointments/mine:
 *   get:
 *     summary: Lista las reservas propias (PATIENT por patientId, DOCTOR por doctorId)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de reservas propias }
 * /appointments/{id}:
 *   delete:
 *     summary: Cancela una reserva (dueno o ADMIN)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Reserva cancelada }
 *       403: { description: No es el dueno ni ADMIN }
 *       404: { description: Reserva no encontrada }
 * /appointments/{id}/request-cancellation:
 *   post:
 *     summary: Un DOCTOR pide cancelar una cita propia, con motivo (requiere aprobacion de ADMIN)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       201: { description: Pedido de cancelacion creado, pendiente de aprobacion }
 *       400: { description: La cita no esta CONFIRMED }
 *       403: { description: La cita no pertenece a este doctor }
 *       409: { description: Ya hay un pedido pendiente para esta cita }
 */
export function buildAppointmentsRoutes(controller: AppointmentsController, tokens: TokenService): Router {
  const router = Router();
  const auth = authMiddleware(tokens);

  router.get('/availability', controller.availability);
  router.post('/', auth, requireRole('PATIENT'), controller.create);
  router.get('/mine', auth, requireRole('PATIENT', 'DOCTOR'), controller.mine);
  router.get('/', auth, requireRole('ADMIN'), controller.list);
  router.delete('/:id', auth, requireRole('PATIENT', 'ADMIN'), controller.cancel);
  router.post('/:id/request-cancellation', auth, requireRole('DOCTOR'), controller.requestCancellation);

  return router;
}
