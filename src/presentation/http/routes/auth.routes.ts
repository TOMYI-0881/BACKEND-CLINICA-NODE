import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { loginRateLimiter } from '../middlewares/rateLimit.middleware';

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
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
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
 */
export function buildAuthRoutes(controller: AuthController): Router {
  const router = Router();
  router.post('/register', controller.register);
  router.post('/login', loginRateLimiter, controller.login);
  return router;
}
