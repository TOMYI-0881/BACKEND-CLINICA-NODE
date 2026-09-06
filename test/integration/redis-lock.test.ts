import { Redis } from 'ioredis';
import { RedisLockService } from '../../src/infrastructure/cache/redis/RedisLockService';
import { env } from '../../src/config/env';

describe('RedisLockService contra Redis real', () => {
  let redis: Redis;
  let lockService: RedisLockService;

  beforeAll(() => {
    redis = new Redis(env.redisUrl);
    lockService = new RedisLockService(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('acquire() obtiene el lock si la clave esta libre', async () => {
    const key = `lock:test:${Date.now()}`;
    const acquired = await lockService.acquire(key, { ttlMs: 2000 });
    expect(acquired).toBe(true);
    await lockService.release(key);
  });

  it('acquire() falla si la clave ya esta tomada (sin reintentos)', async () => {
    const key = `lock:test:${Date.now()}`;
    const first = await lockService.acquire(key, { ttlMs: 5000 });
    const second = await lockService.acquire(key, { ttlMs: 5000 });

    expect(first).toBe(true);
    expect(second).toBe(false);

    await lockService.release(key);
  });

  it('release() no borra un lock ajeno adquirido despues de que el propio expirara', async () => {
    const key = `lock:test:${Date.now()}`;
    await lockService.acquire(key, { ttlMs: 100 });
    await new Promise((resolve) => setTimeout(resolve, 200)); // esperar a que expire

    // otro proceso adquiere la misma clave despues de la expiracion
    const otherLockService = new RedisLockService(redis);
    const reacquired = await otherLockService.acquire(key, { ttlMs: 5000 });
    expect(reacquired).toBe(true);

    // el primer poseedor (con token viejo) intenta liberar: no debe borrar el lock del segundo
    await lockService.release(key);
    const stillHeld = await redis.get(key);
    expect(stillHeld).not.toBeNull();

    await otherLockService.release(key);
  });

  it('el lock expira solo por TTL sin intervencion', async () => {
    const key = `lock:test:${Date.now()}`;
    await lockService.acquire(key, { ttlMs: 100 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const value = await redis.get(key);
    expect(value).toBeNull();
  });
});

describe('RedisLockService fail-open cuando Redis no responde', () => {
  it('acquire() falla rapido (no bloqueante) y nunca reintenta en loop', async () => {
    const unreachableRedis = new Redis({
      host: '127.0.0.1',
      port: 6399, // puerto sin listener
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      connectTimeout: 300,
    });
    const lockService = new RedisLockService(unreachableRedis);

    const start = Date.now();
    const acquired = await lockService.acquire('lock:test:unreachable', { ttlMs: 5000 }).catch(() => false);
    const elapsedMs = Date.now() - start;

    expect(acquired).toBe(false);
    // debe fallar rapido, no colgarse esperando reintentos indefinidos
    expect(elapsedMs).toBeLessThan(3000);

    unreachableRedis.disconnect();
  });
});
