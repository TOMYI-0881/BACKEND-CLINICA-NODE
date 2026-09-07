import multer from 'multer';
import { env } from '../../../config/env';
import { ValidationError } from '../../../domain/errors/ValidationError';

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Middleware de subida de la foto de perfil (unica y opcional por usuario, ver `/auth/me/photo`).
 * Guarda el archivo en memoria (`req.file.buffer`) -- el controller lo sube al `PhotoStorage`
 * configurado (disco local en dev, R2 en produccion, ver config/di.ts) y arma la URL final.
 */
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxPhotoSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(new ValidationError('Formato de imagen no soportado (usar jpg, png o webp)'));
      return;
    }
    cb(null, true);
  },
});

/** Key unica para el objeto en el storage de fotos, preservando la extension segun mimetype. */
export function buildPhotoKey(ownerId: string, mimetype: string): string {
  const ext = ALLOWED_MIME_TO_EXT[mimetype] ?? '';
  return `${ownerId}-${Date.now()}${ext}`;
}
