import { z } from 'zod';

/** Query param opcional `date` de las rutas /queues/:doctorId*, formato YYYY-MM-DD. */
export const QueueDateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date debe tener formato YYYY-MM-DD')
    .optional(),
});

export type QueueDateDto = z.infer<typeof QueueDateSchema>;

/** Fecha de hoy en UTC, formato YYYY-MM-DD (toda la app maneja fechas en UTC). */
export function todayUtc(): string {
  const iso = new Date().toISOString();
  return iso.slice(0, 10);
}
