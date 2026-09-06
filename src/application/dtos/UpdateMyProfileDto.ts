import { z } from 'zod';

export const UpdateMyProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(120, 'El nombre es demasiado largo'),
  email: z.string().email('Email invalido'),
});

export type UpdateMyProfileDto = z.infer<typeof UpdateMyProfileSchema>;
