import { z } from 'zod';

export const UpdateDoctorSchema = z
  .object({
    name: z.string().min(1, 'El nombre no puede estar vacio').optional(),
    specialty: z.string().min(1, 'La especialidad no puede estar vacia').optional(),
    gender: z.enum(['male', 'female']).optional(),
  })
  .refine((data) => data.name !== undefined || data.specialty !== undefined || data.gender !== undefined, {
    message: 'Debe enviarse al menos name, specialty o gender',
  })
  .refine((data) => data.name === undefined || !/^(Dr|Dra)[.\s]/i.test(data.name), {
    message: 'El nombre no debe incluir el prefijo Dr./Dra.',
  });

export type UpdateDoctorDto = z.infer<typeof UpdateDoctorSchema>;
