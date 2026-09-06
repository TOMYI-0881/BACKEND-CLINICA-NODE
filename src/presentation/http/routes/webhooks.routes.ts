import express, { Router } from 'express';
import { WebhooksController } from '../controllers/webhooks.controller';
import { githubSignatureMiddleware } from '../../../infrastructure/webhooks/github/GithubSignatureMiddleware';

/**
 * @openapi
 * /webhooks/github:
 *   post:
 *     summary: Recibe eventos de GitHub (firma HMAC x-hub-signature-256) y notifica a Discord
 *     tags: [Webhooks]
 *     responses:
 *       200: { description: Evento procesado }
 *       401: { description: Firma faltante o invalida }
 */
export function buildWebhooksRoutes(controller: WebhooksController, githubWebhookSecret: string): Router {
  const router = Router();

  // express.raw + la verificacion de firma se aplican SOLO a esta ruta, nunca de
  // forma global con app.use() (seccion 9.4, punto 3).
  router.post(
    '/github',
    express.raw({ type: 'application/json' }),
    githubSignatureMiddleware(githubWebhookSecret),
    controller.github,
  );

  return router;
}
