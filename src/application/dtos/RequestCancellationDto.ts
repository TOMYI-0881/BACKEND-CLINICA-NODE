import { z } from 'zod';

export const RequestCancellationSchema = z.object({
  reason: z.string().min(1, 'El motivo es obligatorio'),
});

export type RequestCancellationDto = z.infer<typeof RequestCancellationSchema>;
