import { z } from 'zod';

export const CreateAppointmentSchema = z
  .object({
    doctorId: z.string().uuid('doctorId debe ser un UUID valido'),
    startTime: z.string().datetime({ message: 'startTime debe ser ISO 8601' }),
    endTime: z.string().datetime({ message: 'endTime debe ser ISO 8601' }),
  })
  .refine((data) => new Date(data.endTime).getTime() > new Date(data.startTime).getTime(), {
    message: 'endTime debe ser posterior a startTime',
    path: ['endTime'],
  });

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;
