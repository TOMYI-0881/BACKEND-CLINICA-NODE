import { UserRole } from '../entities/User';

export interface TokenPayload {
  userId: string;
  role: UserRole;
}

/**
 * Puerto de emision/verificacion de JWT (seccion 9.5). Misma desviacion
 * documentada que PasswordHasher: `JwtAdapter.ts` (seccion 4) necesita una
 * interfaz de dominio para que LoginUser y el middleware de auth no importen
 * `jsonwebtoken` directamente.
 */
export interface TokenService {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload;
}
