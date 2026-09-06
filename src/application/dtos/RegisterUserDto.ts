import { z } from 'zod';

export const RegisterUserSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
});

export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;
