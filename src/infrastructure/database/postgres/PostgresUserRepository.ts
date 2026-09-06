import { Pool } from 'pg';
import { User, UserRole } from '../../../domain/entities/User';
import { NewUserData, UserRepository } from '../../../domain/ports/UserRepository';
import { ConflictError } from '../../../domain/errors/ConflictError';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from './pgErrors';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

function toDomain(row: UserRow): User {
  return User.create({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  });
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async save(data: NewUserData): Promise<User> {
    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
         RETURNING id, email, password_hash, role, created_at`,
        [data.email, data.passwordHash, data.role],
      );
      const row = result.rows[0];
      if (!row) throw new Error('INSERT no devolvio fila');
      return toDomain(row);
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
        throw new ConflictError('El email ya esta registrado');
      }
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1`,
      [email],
    );
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
  }
}
