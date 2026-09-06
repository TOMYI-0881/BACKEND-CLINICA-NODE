import { Pool } from 'pg';
import { Appointment, AppointmentStatus } from '../../../domain/entities/Appointment';
import {
  AppointmentRepository,
  NewAppointmentData,
  PaginatedResult,
} from '../../../domain/ports/AppointmentRepository';
import { ConflictError } from '../../../domain/errors/ConflictError';
import { NotFoundError } from '../../../domain/errors/NotFoundError';
import {
  PG_EXCLUSION_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isTransientConcurrencyError,
  pgErrorCode,
  pgErrorConstraint,
  withRetry,
} from './pgErrors';

interface AppointmentRow {
  id: string;
  doctor_id: string;
  patient_id: string;
  start_time: Date;
  end_time: Date;
  status: AppointmentStatus;
  created_at: Date;
  patient_email?: string;
}

function toDomain(row: AppointmentRow): Appointment {
  return Appointment.create({
    id: row.id,
    doctorId: row.doctor_id,
    patientId: row.patient_id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    createdAt: row.created_at,
    patientEmail: row.patient_email,
  });
}

const SELECT_COLUMNS =
  'id, doctor_id, patient_id, start_time, end_time, status, created_at';

export class PostgresAppointmentRepository implements AppointmentRepository {
  constructor(private readonly pool: Pool) {}

  async save(data: NewAppointmentData): Promise<Appointment> {
    return withRetry(
      async () => {
        try {
          const result = await this.pool.query<AppointmentRow>(
            `INSERT INTO appointments (doctor_id, patient_id, start_time, end_time)
             VALUES ($1, $2, $3, $4)
             RETURNING ${SELECT_COLUMNS}`,
            [data.doctorId, data.patientId, data.startTime, data.endTime],
          );
          const row = result.rows[0];
          if (!row) throw new Error('INSERT no devolvio fila');
          return toDomain(row);
        } catch (err) {
          if (pgErrorCode(err) === PG_EXCLUSION_VIOLATION) {
            if (pgErrorConstraint(err) === 'no_overlapping_patient_appointments') {
              throw new ConflictError('Ya tenes otra cita en ese horario con otro medico');
            }
            throw new ConflictError('Horario ya reservado');
          }
          if (
            pgErrorCode(err) === PG_UNIQUE_VIOLATION &&
            pgErrorConstraint(err) === 'idx_one_active_appointment_per_patient_doctor'
          ) {
            throw new ConflictError('Ya tenes una cita activa con este medico');
          }
          throw err;
        }
      },
      { retries: 10, isRetryable: isTransientConcurrencyError },
    );
  }

  async findById(id: string): Promise<Appointment | null> {
    const result = await this.pool.query<AppointmentRow>(
      `SELECT ${SELECT_COLUMNS} FROM appointments WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async findByPatient(patientId: string): Promise<Appointment[]> {
    const result = await this.pool.query<AppointmentRow>(
      `SELECT ${SELECT_COLUMNS} FROM appointments WHERE patient_id = $1 ORDER BY start_time DESC`,
      [patientId],
    );
    return result.rows.map(toDomain);
  }

  async findByDoctor(doctorId: string): Promise<Appointment[]> {
    const result = await this.pool.query<AppointmentRow>(
      `SELECT a.id, a.doctor_id, a.patient_id, a.start_time, a.end_time,
              a.status, a.created_at, users.email AS patient_email
       FROM appointments a
       JOIN users ON users.id = a.patient_id
       WHERE a.doctor_id = $1
       ORDER BY a.start_time DESC`,
      [doctorId],
    );
    return result.rows.map(toDomain);
  }

  async findAll(params: { page: number; limit: number }): Promise<PaginatedResult<Appointment>> {
    const offset = (params.page - 1) * params.limit;
    const [itemsResult, countResult] = await Promise.all([
      this.pool.query<AppointmentRow>(
        `SELECT ${SELECT_COLUMNS} FROM appointments ORDER BY start_time DESC LIMIT $1 OFFSET $2`,
        [params.limit, offset],
      ),
      this.pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM appointments'),
    ]);

    return {
      items: itemsResult.rows.map(toDomain),
      total: Number(countResult.rows[0]?.count ?? '0'),
      page: params.page,
      limit: params.limit,
    };
  }

  async findBlockingByDoctorAndDate(doctorId: string, date: string): Promise<Appointment[]> {
    const result = await this.pool.query<AppointmentRow>(
      `SELECT ${SELECT_COLUMNS} FROM appointments
       WHERE doctor_id = $1 AND status IN ('CONFIRMED', 'CANCELLATION_REQUESTED') AND start_time::date = $2::date
       ORDER BY start_time ASC`,
      [doctorId, date],
    );
    return result.rows.map(toDomain);
  }

  async findFutureConfirmedByDoctor(doctorId: string, from: Date): Promise<Appointment[]> {
    const result = await this.pool.query<AppointmentRow>(
      `SELECT ${SELECT_COLUMNS} FROM appointments
       WHERE doctor_id = $1 AND status = 'CONFIRMED' AND start_time >= $2
       ORDER BY start_time ASC`,
      [doctorId, from],
    );
    return result.rows.map(toDomain);
  }

  async cancel(id: string): Promise<Appointment> {
    const result = await this.pool.query<AppointmentRow>(
      `UPDATE appointments SET status = 'CANCELLED' WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Reserva no encontrada');
    return toDomain(row);
  }
}
