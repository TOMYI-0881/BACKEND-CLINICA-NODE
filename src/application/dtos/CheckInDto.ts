import { z } from 'zod';

export const CheckInSchema = z.object({
  appointmentId: z.string().uuid('appointmentId debe ser un UUID valido').optional(),
  patientName: z.string().min(1, 'patientName es obligatorio'),
  priority: z.enum(['normal', 'preferente']).default('normal'),
});

export type CheckInDto = z.infer<typeof CheckInSchema>;
