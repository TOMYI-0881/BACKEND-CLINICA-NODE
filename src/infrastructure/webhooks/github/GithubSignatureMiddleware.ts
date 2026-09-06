import { NextFunction, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifica HMAC-SHA256 del header x-hub-signature-256 con crypto.timingSafeEqual
 * (nunca ===, para evitar timing attacks). Requiere que `req.body` sea el Buffer
 * crudo del payload (montar `express.raw({ type: 'application/json' })` ANTES de
 * este middleware en la ruta), ya que firmar sobre `JSON.stringify(req.body)`
 * tras parsear puede no coincidir byte a byte con lo que GitHub firmo.
 * Se aplica solo a POST /webhooks/github, nunca de forma global (seccion 9.4).
 */
export function githubSignatureMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.header('x-hub-signature-256');
    const body = req.body as unknown;

    if (!signature || !Buffer.isBuffer(body)) {
      res.status(401).json({ error: 'Firma faltante o payload invalido' });
      return;
    }

    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    const isValid =
      signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      res.status(401).json({ error: 'Firma invalida' });
      return;
    }

    next();
  };
}
