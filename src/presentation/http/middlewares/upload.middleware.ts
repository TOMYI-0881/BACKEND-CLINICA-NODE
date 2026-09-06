import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../../../config/env';
import { ValidationError } from '../../../domain/errors/ValidationError';

const PHOTOS_SUBDIR = 'photos';
const PHOTOS_DIR = path.resolve(process.cwd(), env.uploadDir, PHOTOS_SUBDIR);
const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype] ?? path.extname(file.originalname);
    cb(null, `${req.user?.userId ?? 'anon'}-${Date.now()}${ext}`);
  },
});

/** Middleware de subida de la foto de perfil (unica y opcional por usuario, ver `/auth/me/photo`). */
export const photoUpload = multer({
  storage,
  limits: { fileSize: env.maxPhotoSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(new ValidationError('Formato de imagen no soportado (usar jpg, png o webp)'));
      return;
    }
    cb(null, true);
  },
});

/** Borra el archivo de una foto previa, best-effort (no-op si ya no existe). */
export function deletePhotoFile(photoUrl: string | null | undefined): void {
  if (!photoUrl) return;
  const filePath = path.resolve(process.cwd(), env.uploadDir, PHOTOS_SUBDIR, path.basename(photoUrl));
  fs.unlink(filePath, () => undefined);
}
