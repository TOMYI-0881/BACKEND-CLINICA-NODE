import bcrypt from 'bcrypt';
import { PasswordHasher } from '../../domain/ports/PasswordHasher';

const SALT_ROUNDS = 10;

export class BcryptAdapter implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  async compare(plainPassword: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hash);
  }
}
