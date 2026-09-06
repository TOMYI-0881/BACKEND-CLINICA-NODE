import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { asyncHandler } from '../asyncHandler';

export interface HealthControllerDeps {
  pgPool: Pool;
  redis: Redis;
}

export interface HealthController {
  health: RequestHandler;
}

/** Verifica conectividad REAL a Postgres y Redis, no solo que el proceso este vivo. */
export function createHealthController(deps: HealthControllerDeps): HealthController {
  const health = asyncHandler(async (_req, res) => {
    const [postgres, redis] = await Promise.all([checkPostgres(deps.pgPool), checkRedis(deps.redis)]);

    const healthy = postgres && redis;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      checks: { postgres, redis },
    });
  });

  return { health };
}

async function checkPostgres(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(redis: Redis): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
