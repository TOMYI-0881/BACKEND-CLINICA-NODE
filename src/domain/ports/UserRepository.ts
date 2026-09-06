import { User, UserRole } from '../entities/User';

export interface NewUserData {
  email: string;
  passwordHash: string;
  role: UserRole;
  name: string;
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
  /** Foto de perfil unica y opcional; null la borra. */
  updatePhotoUrl(userId: string, photoUrl: string | null): Promise<void>;
  /**
   * @throws ConflictError si el email pertenece a otro usuario.
   * @throws NotFoundError si el usuario no existe.
   */
  updateProfile(userId: string, data: { name: string; email: string }): Promise<User>;
}
