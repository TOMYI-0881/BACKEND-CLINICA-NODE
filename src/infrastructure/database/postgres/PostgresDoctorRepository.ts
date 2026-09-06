import { Pool } from 'pg';
import { Doctor } from '../../../domain/entities/Doctor';
import { DoctorRepository, NewDoctorAccountData, UpdateDoctorData } from '../../../domain/ports/DoctorRepository';
import { ConflictError } from '../../../domain/errors/ConflictError';
import { NotFoundError } from '../../../domain/errors/NotFoundError';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from './pgErrors';

interface DoctorRow {
  id: string;
  user_id: string;
  name: string;
  specialty: string;
  is_active: boolean;
  created_at: Date;
  photo_url: string | null;
}

const SELECT_COLUMNS = 'id, user_id, name, specialty, is_active, created_at, photo_url';

function toDomain(row: DoctorRow): Doctor {
  return Doctor.create({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    specialty: row.specialty,
    isActive: row.is_active,
    createdAt: row.created_at,
    photoUrl: row.photo_url,
  });
}

export class PostgresDoctorRepository implements DoctorRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Crea la cuenta (users, rol DOCTOR) y el perfil (doctors) en una unica transaccion --
   * nunca dejar un usuario huerfano sin perfil de doctor si el segundo insert falla.
   */
  async createDoctorAccount(data: NewDoctorAccountData): Promise<Doctor> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'DOCTOR') RETURNING id`,
        [data.email, data.passwordHash],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) throw new Error('INSERT de usuario no devolvio fila');

      const doctorResult = await client.query<DoctorRow>(
        `INSERT INTO doctors (user_id, name, specialty) VALUES ($1, $2, $3)
         RETURNING ${SELECT_COLUMNS}`,
        [userId, data.name, data.specialty],
      );
      const doctorRow = doctorResult.rows[0];
      if (!doctorRow) throw new Error('INSERT de doctor no devolvio fila');

      await client.query('COMMIT');
      return toDomain(doctorRow);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
        throw new ConflictError('El email ya esta registrado');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async findAll(): Promise<Doctor[]> {
    const result = await this.pool.query<DoctorRow>(
      `SELECT ${SELECT_COLUMNS} FROM doctors WHERE is_active = true ORDER BY name ASC`,
    );
    return result.rows.map(toDomain);
  }

  async findById(id: string): Promise<Doctor | null> {
    const result = await this.pool.query<DoctorRow>(`SELECT ${SELECT_COLUMNS} FROM doctors WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async findByUserId(userId: string): Promise<Doctor | null> {
    const result = await this.pool.query<DoctorRow>(`SELECT ${SELECT_COLUMNS} FROM doctors WHERE user_id = $1`, [
      userId,
    ]);
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async update(id: string, data: UpdateDoctorData): Promise<Doctor> {
    const result = await this.pool.query<DoctorRow>(
      `UPDATE doctors SET name = COALESCE($2, name), specialty = COALESCE($3, specialty)
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, data.name ?? null, data.specialty ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Doctor no encontrado');
    return toDomain(row);
  }

  async deactivate(id: string): Promise<Doctor> {
    const result = await this.pool.query<DoctorRow>(
      `UPDATE doctors SET is_active = false WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Doctor no encontrado');
    return toDomain(row);
  }

  async updatePhoto(id: string, photoUrl: string | null): Promise<Doctor> {
    const result = await this.pool.query<DoctorRow>(
      `UPDATE doctors SET photo_url = $2 WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [id, photoUrl],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Doctor no encontrado');
    return toDomain(row);
  }
}
