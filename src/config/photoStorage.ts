import { env } from './env';
import { PhotoStorage } from '../domain/ports/PhotoStorage';
import { LocalDiskPhotoStorage } from '../infrastructure/storage/local/LocalDiskPhotoStorage';
import { R2PhotoStorage } from '../infrastructure/storage/r2/R2PhotoStorage';

/**
 * R2 si las 5 variables estan presentes (produccion, disco efimero), disco local si no
 * (default de dev) -- mismo patron no-op-si-vacio que DiscordNotificationService/EmailService.
 * Vive en su propio modulo (no en di.ts) para que scripts/seed.ts pueda importarlo sin
 * arrastrar el resto del grafo de dependencias: di.ts crea el pgPool y las conexiones Redis
 * como side-effect del import, y seed.ts abre su propio Pool independiente sin tocar Redis.
 */
export function buildPhotoStorage(): PhotoStorage {
  if (env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2Bucket && env.r2PublicUrl) {
    return new R2PhotoStorage({
      accountId: env.r2AccountId,
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
      bucket: env.r2Bucket,
      publicUrl: env.r2PublicUrl,
    });
  }
  return new LocalDiskPhotoStorage({ uploadDir: env.uploadDir });
}
