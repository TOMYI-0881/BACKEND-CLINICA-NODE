import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { buildContainer, AppContainer } from '../../src/config/di';
import { env } from '../../src/config/env';

export interface E2EContext {
  app: Express;
  container: AppContainer;
  pool: Pool;
  redis: Redis;
}

/** Construye la app completa contra la infraestructura real (Postgres/Redis en Docker). */
export function buildE2EContext(): E2EContext {
  const container = buildContainer();
  const app = createApp(container);
  return { app, container, pool: container.pgPool, redis: container.redis };
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE appointment_cancellation_requests, turns, appointments, doctors, users RESTART IDENTITY CASCADE',
  );
}

let doctorEmailCounter = 0;

/**
 * Desde el rol DOCTOR, todo doctor es tambien una cuenta de usuario -- este helper crea
 * ambas filas via SQL directo (los tests e2e ya usan `ctx.pool` crudo para fixtures).
 */
export async function createDoctorRow(
  pool: Pool,
  data: { name: string; specialty: string },
): Promise<{ id: string; userId: string }> {
  doctorEmailCounter += 1;
  const email = `doctor-e2e-${Date.now()}-${doctorEmailCounter}@test.com`;
  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, 'hash', 'DOCTOR') RETURNING id`,
    [email],
  );
  const userId = userResult.rows[0]!.id;
  const doctorResult = await pool.query<{ id: string }>(
    `INSERT INTO doctors (user_id, name, specialty) VALUES ($1, $2, $3) RETURNING id`,
    [userId, data.name, data.specialty],
  );
  return { id: doctorResult.rows[0]!.id, userId };
}

export async function closeE2EContext(ctx: E2EContext): Promise<void> {
  // CreateAppointment/CancelAppointment/CheckInPatient disparan publish()/notify() sin
  // esperarlos (seccion 9.4, punto 4: nunca bloquean la respuesta HTTP). Un pequeno margen
  // antes de cerrar las conexiones evita que esas promesas en vuelo logueen "Connection is
  // closed" despues de que el archivo de test ya termino. quit() (vs. disconnect()) ademas
  // espera a que los comandos ya encolados terminen antes de cerrar.
  await new Promise((resolve) => setTimeout(resolve, 100));
  await ctx.pool.end();
  await ctx.redis.quit();
  await ctx.container.redisSubscriberConnection.quit();
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** DATABASE_URL/REDIS_URL ya apuntan a los contenedores de Docker via .env (ver Fase 2). */
export function assertUsingTestInfra(): void {
  if (env.nodeEnv === 'production') {
    throw new Error('No corras los tests e2e contra un entorno de produccion');
  }
}
