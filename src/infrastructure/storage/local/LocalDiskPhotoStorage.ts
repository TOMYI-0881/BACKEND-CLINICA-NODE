import fs from 'fs';
import path from 'path';
import { PhotoStorage } from '../../../domain/ports/PhotoStorage';

const PHOTOS_SUBDIR = 'photos';

export interface LocalDiskPhotoStorageConfig {
  /** Relativo a process.cwd(), mismo valor que UPLOAD_DIR. */
  uploadDir: string;
}

/**
 * Default de desarrollo: guarda en disco, servido por express.static bajo /uploads (ver
 * app.ts). No persiste entre deploys en hosts de disco efimero -- ver R2PhotoStorage.
 */
export class LocalDiskPhotoStorage implements PhotoStorage {
  private readonly dir: string;

  constructor(config: LocalDiskPhotoStorageConfig) {
    this.dir = path.resolve(process.cwd(), config.uploadDir, PHOTOS_SUBDIR);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async upload(buffer: Buffer, key: string): Promise<string> {
    await fs.promises.writeFile(path.join(this.dir, key), buffer);
    return `/uploads/${PHOTOS_SUBDIR}/${key}`;
  }

  async delete(photoUrl: string | null | undefined): Promise<void> {
    if (!photoUrl) return;
    const filePath = path.join(this.dir, path.basename(photoUrl));
    await fs.promises.unlink(filePath).catch(() => undefined);
  }
}
