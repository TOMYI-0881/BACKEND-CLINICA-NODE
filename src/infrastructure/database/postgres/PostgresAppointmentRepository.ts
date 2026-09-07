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

const ONE_APPOINTMENT_PER_PATIENT_DOCTOR_DAY_INDEX = 'idx_one_appointment_per_patient_doctor_day';

export class PostgresAppointmentRepository implements AppointmentRepository {
  constructor(private readonly pool: Pool) {}

  async save(data: NewAppointmentData): Promise<Appointment> {
    return withRetry(
      async () => {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');

          // Higiene de datos: deja COMPLETED una cita vieja que nadie cerro explicitamente via
          // la cola (ver PostgresQueueRepository.finishCurrentTurn). No hace falta para que el
          // indice por-dia (idx_one_appointment_per_patient_doctor_day) permita reservar en otro
          // dia -- ese indice ya distingue por start_time::date sin importar el status.
          await client.query(
            `UPDATE appointments
             SET status = 'COMPLETED'
             WHERE patient_id = $1 AND doctor_id = $2
               AND status IN ('CONFIRMED', 'CANCELLATION_REQUESTED')
               AND start_time < now()`,
            [data.patientId, data.doctorId],
          );

          // Pre-chequeo para distinguir el mensaje de error: el indice unico
          // (idx_one_appointment_per_patient_doctor_day) no dice que fila choco, y solo puede
          // haber a lo sumo una fila por (patient_id, doctor_id, dia UTC) en estos estados.
          const conflicting = await client.query<{ status: AppointmentStatus }>(
            `SELECT status
             FROM appointments
             WHERE patient_id = $1 AND doctor_id = $2
               AND (start_time AT TIME ZONE 'UTC')::date = ($3::timestamptz AT TIME ZONE 'UTC')::date
               AND status IN ('CONFIRMED', 'CANCELLATION_REQUESTED', 'COMPLETED')
             LIMIT 1`,
            [data.patientId, data.doctorId, data.startTime],
          );
          const conflictRow = conflicting.rows[0];
          if (conflictRow) {
            if (conflictRow.status === 'COMPLETED') {
              throw new ConflictError('Ya fuiste atendido por este doctor hoy. Podés reservar para otro día.');
            }
            throw new ConflictError('Ya tenés una cita con este doctor para ese día. Esperá a ser atendido.');
          }

          const result = await client.query<AppointmentRow>(
            `INSERT INTO appointments (doctor_id, patient_id, start_time, end_time)
             VALUES ($1, $2, $3, $4)
             RETURNING ${SELECT_COLUMNS}`,
            [data.doctorId, data.patientId, data.startTime, data.endTime],
          );

          await client.query('COMMIT');
          const row = result.rows[0];
          if (!row) throw new Error('INSERT no devolvio fila');
          return toDomain(row);
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          if (pgErrorCode(err) === PG_EXCLUSION_VIOLATION) {
            if (pgErrorConstraint(err) === 'no_overlapping_patient_appointments') {
              throw new ConflictError('Ya tenes otra cita en ese horario con otro medico');
            }
            throw new ConflictError('Horario ya reservado');
          }
          if (
            pgErrorCode(err) === PG_UNIQUE_VIOLATION &&
            pgErrorConstraint(err) === ONE_APPOINTMENT_PER_PATIENT_DOCTOR_DAY_INDEX
          ) {
            throw new ConflictError('Ya tenes una cita con este doctor ese mismo dia');
          }
          throw err;
        } finally {
          client.release();
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
