import { Router } from 'express';
import { DoctorsController } from '../controllers/doctors.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/roles.middleware';
import { photoUpload } from '../middlewares/upload.middleware';
import { TokenService } from '../../../domain/ports/TokenService';

/**
 * @openapi
 * /doctors:
 *   get:
 *     summary: Lista los doctores activos
 *     tags: [Doctors]
 *     responses:
 *       200: { description: Lista de doctores }
 *   post:
 *     summary: Crea un doctor (tambien crea su cuenta de usuario, rol DOCTOR)
 *     tags: [Doctors]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, specialty, email, password]
 *             properties:
 *               name: { type: string }
 *               specialty: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       201: { description: Doctor creado }
 *       401: { description: No autenticado }
 *       403: { description: Rol insuficiente (requiere ADMIN) }
 *       409: { description: Email ya registrado }
 * /doctors/{id}:
 *   patch:
 *     summary: Edita nombre/especialidad de un doctor
 *     tags: [Doctors]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Doctor actualizado }
 *       404: { description: Doctor no encontrado }
 *   delete:
 *     summary: Desactiva un doctor (soft-delete) y cancela sus citas futuras confirmadas
 *     tags: [Doctors]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Doctor desactivado }
 *       404: { description: Doctor no encontrado }
 * /doctors/{id}/reset-password:
 *   post:
 *     summary: Genera una nueva contrasena para el doctor y se la envia por email
 *     tags: [Doctors]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Contrasena restablecida }
 *       404: { description: Doctor no encontrado }
 * /doctors/{id}/photo:
 *   post:
 *     summary: Sube (o reemplaza) la foto de perfil de un doctor. Requiere JWT de rol ADMIN.
 *     tags: [Doctors]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [photo]
 *             properties:
 *               photo: { type: string, format: binary }
 *     responses:
 *       200: { description: Foto actualizada }
 *       400: { description: Falta el archivo, formato no soportado o excede el tamano maximo }
 *       401: { description: No autenticado }
 *       403: { description: Rol distinto de ADMIN }
 *       404: { description: Doctor no encontrado }
 *   delete:
 *     summary: Quita la foto de perfil de un doctor. Requiere JWT de rol ADMIN.
 *     tags: [Doctors]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Foto eliminada }
 *       401: { description: No autenticado }
 *       403: { description: Rol distinto de ADMIN }
 *       404: { description: Doctor no encontrado }
 */
export function buildDoctorsRoutes(controller: DoctorsController, tokens: TokenService): Router {
  const router = Router();
  const admin = [authMiddleware(tokens), requireRole('ADMIN')];

  router.get('/', controller.list);
  router.post('/', ...admin, controller.create);
  router.patch('/:id', ...admin, controller.update);
  router.delete('/:id', ...admin, controller.deactivate);
  router.post('/:id/reset-password', ...admin, controller.resetPassword);
  router.post('/:id/photo', ...admin, photoUpload.single('photo'), controller.uploadPhoto);
  router.delete('/:id/photo', ...admin, controller.removePhoto);

  return router;
}
