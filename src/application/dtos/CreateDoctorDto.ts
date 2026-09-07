import { z } from 'zod';

/**
 * No listado en la seccion 4 (ver nota de desviacion en DoctorRepository.ts),
 * pero necesario para POST /doctors (seccion 6). Desde el rol DOCTOR (ver AI-CONTEXT.md),
 * crear un doctor tambien crea su cuenta de usuario -- necesita email/password.
 */
export const CreateDoctorSchema = z
  .object({
    name: z.string().min(1, 'El nombre es obligatorio'),
    specialty: z.string().min(1, 'La especialidad es obligatoria'),
    email: z.string().email('Email invalido'),
    password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
    gender: z.enum(['male', 'female'], { message: 'El genero es obligatorio' }),
  })
  .refine((d) => !/^(Dr|Dra)[.\s]/i.test(d.name), {
    message: 'El nombre no debe incluir el prefijo Dr./Dra.',
  });

export type CreateDoctorDto = z.infer<typeof CreateDoctorSchema>;
