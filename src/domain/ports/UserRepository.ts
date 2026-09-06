import { User, UserRole } from '../entities/User';

export interface NewUserData {
  email: string;
  passwordHash: string;
  role: UserRole;
}

/**
 * Puerto de persistencia de usuarios. La implementacion Postgres debe traducir
 * la violacion de la restriccion UNIQUE(email) a un ConflictError de dominio.
 */
export interface UserRepository {
  save(data: NewUserData): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Usado por el reset de contrasena de un doctor (ADMIN). */
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
}
