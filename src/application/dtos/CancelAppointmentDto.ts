import { z } from 'zod';

export const CancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid('appointmentId debe ser un UUID valido'),
});

export type CancelAppointmentDto = z.infer<typeof CancelAppointmentSchema>;
