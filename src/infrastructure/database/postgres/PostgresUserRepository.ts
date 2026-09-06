import { Pool } from 'pg';
import { User, UserRole } from '../../../domain/entities/User';
import { NewUserData, UserRepository } from '../../../domain/ports/UserRepository';
import { ConflictError } from '../../../domain/errors/ConflictError';
import { NotFoundError } from '../../../domain/errors/NotFoundError';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from './pgErrors';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  photo_url: string | null;
  name: string;
}

const SELECT_COLUMNS = 'id, email, password_hash, role, created_at, photo_url, name';

function toDomain(row: UserRow): User {
  return User.create({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    photoUrl: row.photo_url,
    name: row.name,
  });
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async save(data: NewUserData): Promise<User> {
    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4)
         RETURNING ${SELECT_COLUMNS}`,
        [data.email, data.passwordHash, data.role, data.name],
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
    const result = await this.pool.query<UserRow>(`SELECT ${SELECT_COLUMNS} FROM users WHERE email = $1`, [email]);
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
  }

  async updatePhotoUrl(userId: string, photoUrl: string | null): Promise<void> {
    await this.pool.query('UPDATE users SET photo_url = $2 WHERE id = $1', [userId, photoUrl]);
  }

  async updateProfile(userId: string, data: { name: string; email: string }): Promise<User> {
    try {
      const result = await this.pool.query<UserRow>(
        `UPDATE users SET name = $2, email = $3 WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
        [userId, data.name, data.email],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundError('Usuario no encontrado');
      return toDomain(row);
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
        throw new ConflictError('El email ya esta registrado');
      }
      throw err;
    }
  }
}
