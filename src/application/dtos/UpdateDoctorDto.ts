import { z } from 'zod';

export const UpdateDoctorSchema = z
  .object({
    name: z.string().min(1, 'El nombre no puede estar vacio').optional(),
    specialty: z.string().min(1, 'La especialidad no puede estar vacia').optional(),
  })
  .refine((data) => data.name !== undefined || data.specialty !== undefined, {
    message: 'Debe enviarse al menos name o specialty',
  });

export type UpdateDoctorDto = z.infer<typeof UpdateDoctorSchema>;
