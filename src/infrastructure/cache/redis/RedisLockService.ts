import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import { AcquireOptions, LockService } from '../../../domain/ports/LockService';

const RELEASE_IF_OWNER_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Optimizacion, nunca la garantia de correctitud (seccion 9.2). `acquire` es una
 * unica operacion SET NX -- sin reintentos ni espera bloqueante -- por lo que
 * falla rapido tanto si la clave ya esta tomada como si Redis no responde (el
 * `.catch(() => false)` del llamador cubre este ultimo caso: fail-open).
 * `release` usa un token aleatorio por lock para nunca borrar un lock ajeno
 * que haya sido adquirido por otro proceso despues de que el propio TTL expirara.
 */
export class RedisLockService implements LockService {
  private readonly tokens = new Map<string, string>();

  constructor(private readonly redis: Redis) {}

  async acquire(key: string, options: AcquireOptions): Promise<boolean> {
    const token = randomUUID();
    const result = await this.redis.set(key, token, 'PX', options.ttlMs, 'NX');
    if (result === 'OK') {
      this.tokens.set(key, token);
      return true;
    }
    return false;
  }

  async release(key: string): Promise<void> {
    const token = this.tokens.get(key);
    if (!token) return;
    this.tokens.delete(key);
    await this.redis.eval(RELEASE_IF_OWNER_SCRIPT, 1, key, token);
  }
}
