import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PhotoStorage } from '../../../domain/ports/PhotoStorage';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** URL publica del bucket (R2.dev o dominio propio), sin slash final. */
  publicUrl: string;
}

/**
 * Object storage compatible con S3 (Cloudflare R2). Se usa en produccion cuando el host de
 * la API tiene disco efimero (se pierde en cada redeploy/reinicio) -- el archivo vive fuera
 * del contenedor, la URL publica de R2 no depende de que instancia lo sirva.
 */
export class R2PhotoStorage implements PhotoStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl.replace(/\/$/, '');
  }

  async upload(buffer: Buffer, key: string, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType }),
    );
    return `${this.publicUrl}/${key}`;
  }

  async delete(photoUrl: string | null | undefined): Promise<void> {
    if (!photoUrl || !photoUrl.startsWith(this.publicUrl)) return;
    const key = photoUrl.slice(this.publicUrl.length + 1);
    if (!key) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => undefined);
  }
}
