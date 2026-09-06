import { z } from 'zod';

export const GetAvailabilitySchema = z.object({
  doctorId: z.string().uuid('doctorId debe ser un UUID valido'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date debe tener formato YYYY-MM-DD'),
});

export type GetAvailabilityDto = z.infer<typeof GetAvailabilitySchema>;
