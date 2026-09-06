export interface AcquireOptions {
  ttlMs: number;
}

/**
 * Puerto de locking distribuido (seccion 9.2). Es una optimizacion, nunca la
 * garantia de correctitud: la fuente de verdad siempre es una restriccion de
 * Postgres (EXCLUDE o indice unico). `acquire` debe fallar rapido -- nunca
 * reintentar en loop ni esperar bloqueante -- y el llamador debe seguir su
 * flujo hacia Postgres incluso si `acquire` retorna false o rechaza (fail-open).
 */
export interface LockService {
  /** Devuelve true si se obtuvo el lock, false si ya estaba tomado. */
  acquire(key: string, options: AcquireOptions): Promise<boolean>;
  release(key: string): Promise<void>;
}
