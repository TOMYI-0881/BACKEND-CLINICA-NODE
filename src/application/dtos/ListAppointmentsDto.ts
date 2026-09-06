import { z } from 'zod';

export const ListAppointmentsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListAppointmentsDto = z.infer<typeof ListAppointmentsSchema>;
