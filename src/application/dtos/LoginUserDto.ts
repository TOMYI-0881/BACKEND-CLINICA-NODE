import { z } from 'zod';

export const LoginUserSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(1, 'La contrasena es obligatoria'),
});

export type LoginUserDto = z.infer<typeof LoginUserSchema>;
