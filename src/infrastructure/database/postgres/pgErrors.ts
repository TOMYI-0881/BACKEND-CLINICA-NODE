export const PG_UNIQUE_VIOLATION = '23505';
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_DEADLOCK_DETECTED = '40P01';
export const PG_SERIALIZATION_FAILURE = '40001';

export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Nombre de la constraint/indice que disparo la violacion (pg.DatabaseError#constraint). */
export function pgErrorConstraint(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'constraint' in err) {
    const { constraint } = err;
    return typeof constraint === 'string' ? constraint : undefined;
  }
  return undefined;
}

/**
 * Bajo alta concurrencia, las restricciones EXCLUDE (GiST) y las transacciones
 * con locking explicito pueden fallar con "deadlock detected" o "serialization
 * failure" en lugar de (o ademas de) el codigo de violacion especifico -- es un
 * comportamiento documentado de Postgres, no un bug de la aplicacion. Postgres
 * recomienda reintentar estos codigos transitorios; no representan un conflicto
 * de negocio real, solo una colision de scheduling entre transacciones.
 */
export function isTransientConcurrencyError(err: unknown): boolean {
  const code = pgErrorCode(err);
  return code === PG_DEADLOCK_DETECTED || code === PG_SERIALIZATION_FAILURE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  retries: number;
  isRetryable: (err: unknown) => boolean;
}

/** Reintenta `fn` con un pequeno backoff aleatorio mientras el error sea retryable. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!opts.isRetryable(err) || attempt === opts.retries) throw err;
      // Backoff exponencial con jitter grande: el deadlock detector de Postgres tarda
      // ~1s (deadlock_timeout) en resolver cada ciclo, y si todos los perdedores
      // reintentan casi al mismo tiempo (despertados por el mismo ciclo de deadlock)
      // vuelven a chocar entre si formando una cascada. Un jitter amplio los desincroniza.
      const exponentialMs = Math.min(2 ** attempt * 20, 1500);
      await sleep(Math.floor(Math.random() * exponentialMs) + 10);
    }
  }
  throw lastErr;
}
