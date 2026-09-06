import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { loginRateLimiter } from '../middlewares/rateLimit.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';
import { photoUpload } from '../middlewares/upload.middleware';
import { TokenService } from '../../../domain/ports/TokenService';

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Registra un usuario nuevo (rol PATIENT por defecto)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *               name: { type: string, minLength: 2, maxLength: 120 }
 *     responses:
 *       201: { description: Usuario creado }
 *       400: { description: Datos invalidos }
 *       409: { description: Email ya registrado }
 * /auth/login:
 *   post:
 *     summary: Autentica y retorna un JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login exitoso, retorna token JWT }
 *       401: { description: Credenciales invalidas }
 *       429: { description: Demasiados intentos }
 * /auth/me:
 *   get:
 *     summary: Devuelve el perfil del usuario autenticado
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Perfil del usuario }
 *       401: { description: No autenticado }
 *   patch:
 *     summary: Edita el nombre y email del usuario autenticado
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 120 }
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Perfil actualizado }
 *       400: { description: Datos invalidos }
 *       401: { description: No autenticado }
 *       409: { description: El email ya esta registrado por otro usuario }
 * /auth/me/photo:
 *   post:
 *     summary: Sube (o reemplaza) la foto de perfil del usuario autenticado (jpg/png/webp)
 *     tags: [Auth]
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
 *       400: { description: Archivo faltante, formato no soportado o excede el tamano maximo }
 *       401: { description: No autenticado }
 *   delete:
 *     summary: Quita la foto de perfil del usuario autenticado
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Foto eliminada }
 *       401: { description: No autenticado }
 */
export function buildAuthRoutes(controller: AuthController, tokens: TokenService): Router {
  const router = Router();
  const authenticated = authMiddleware(tokens);

  router.post('/register', controller.register);
  router.post('/login', loginRateLimiter, controller.login);
  router.get('/me', authenticated, controller.me);
  router.patch('/me', authenticated, controller.updateProfile);
  router.post('/me/photo', authenticated, photoUpload.single('photo'), controller.uploadPhoto);
  router.delete('/me/photo', authenticated, controller.removePhoto);

  return router;
}
