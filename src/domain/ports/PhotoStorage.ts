/**
 * Almacenamiento de fotos de perfil (medicos/pacientes). Dos adaptadores: disco local
 * (dev, default) y R2 (produccion, cuando el disco del host no persiste entre deploys).
 */
export interface PhotoStorage {
  /** Sube el archivo y devuelve la URL publica final para guardar en users.photo_url. */
  upload(buffer: Buffer, key: string, contentType: string): Promise<string>;
  /** Borra el archivo de una foto previa. Best-effort: nunca lanza (no-op si ya no existe). */
  delete(photoUrl: string | null | undefined): Promise<void>;
}
