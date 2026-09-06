import { Pool, PoolClient } from 'pg';
import { Turn, TurnPriority, TurnStatus } from '../../../domain/entities/Turn';
import {
  NewTurnData,
  QueueRepository,
  QueueStatus,
  TurnTransitionResult,
} from '../../../domain/ports/QueueRepository';
import { ConflictError } from '../../../domain/errors/ConflictError';
import {
  PG_UNIQUE_VIOLATION,
  isTransientConcurrencyError,
  pgErrorCode,
  pgErrorConstraint,
  withRetry,
} from './pgErrors';

const ONE_TURN_PER_APPOINTMENT_INDEX = 'idx_turns_one_per_appointment';

interface TurnRow {
  id: string;
  doctor_id: string;
  appointment_id: string | null;
  // pg parsea columnas DATE como Date (UTC medianoche) por defecto, no como string.
  queue_date: string | Date;
  number: number;
  patient_name: string;
  priority: TurnPriority;
  status: TurnStatus;
  created_at: Date;
  finished_at: Date | null;
}

const SELECT_COLUMNS =
  'id, doctor_id, appointment_id, queue_date, number, patient_name, priority, status, created_at, finished_at';

// Version calificada con alias "t.", usada solo en los SELECT de waiting que hacen JOIN
// contra appointments (getStatus/promoteNextWaiting) -- sin esto "id"/"status"/etc. serian
// ambiguos entre turns y appointments.
const QUALIFIED_TURN_COLUMNS =
  't.id, t.doctor_id, t.appointment_id, t.queue_date, t.number, t.patient_name, t.priority, t.status, t.created_at, t.finished_at';

function toDomain(row: TurnRow): Turn {
  return Turn.create({
    id: row.id,
    doctorId: row.doctor_id,
    appointmentId: row.appointment_id,
    // queue_date llega como Date desde pg; se normaliza a 'YYYY-MM-DD'.
    queueDate:
      row.queue_date instanceof Date ? row.queue_date.toISOString().slice(0, 10) : row.queue_date,
    number: row.number,
    patientName: row.patient_name,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  });
}

// Bajo alta concurrencia sin el lock de Redis (que llega en la Fase 4 y reduce
// drasticamente la contencion real), muchos check-in simultaneos pueden colisionar
// repetidamente calculando el mismo numero antes de que el primero confirme.
// El indice unico (doctor_id, queue_date, number) es la garantia real (seccion 9.7);
// este limite solo acota cuantas veces se recalcula el numero.
const MAX_NUMBER_ASSIGNMENT_RETRIES = 40;

function backoff(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 15) + attempt));
}

export class PostgresQueueRepository implements QueueRepository {
  constructor(private readonly pool: Pool) {}

  async checkIn(data: NewTurnData): Promise<Turn> {
    for (let attempt = 0; attempt < MAX_NUMBER_ASSIGNMENT_RETRIES; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        const numberResult = await client.query<{ next: number }>(
          `SELECT COALESCE(MAX(number), 0) + 1 AS next FROM turns WHERE doctor_id = $1 AND queue_date = $2`,
          [data.doctorId, data.queueDate],
        );
        const nextNumber = numberResult.rows[0]?.next ?? 1;

        const insertResult = await client.query<TurnRow>(
          `INSERT INTO turns (doctor_id, appointment_id, queue_date, number, patient_name, priority)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING ${SELECT_COLUMNS}`,
          [data.doctorId, data.appointmentId, data.queueDate, nextNumber, data.patientName, data.priority],
        );

        await client.query('COMMIT');
        const row = insertResult.rows[0];
        if (!row) throw new Error('INSERT no devolvio fila');
        return toDomain(row);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);

        // Doble check-in de la misma cita (seccion 9.7): nunca reintentar, el
        // appointmentId ya tiene un turno y jamas dejara de tenerlo. Mismo
        // patron que el EXCLUDE de appointments -- la BD es la fuente de verdad.
        if (pgErrorCode(err) === PG_UNIQUE_VIOLATION && pgErrorConstraint(err) === ONE_TURN_PER_APPOINTMENT_INDEX) {
          throw new ConflictError('Esta cita ya tiene un turno de cola generado');
        }

        const isLastAttempt = attempt === MAX_NUMBER_ASSIGNMENT_RETRIES - 1;
        const retryable = pgErrorCode(err) === PG_UNIQUE_VIOLATION || isTransientConcurrencyError(err);
        if (retryable && !isLastAttempt) {
          await backoff(attempt);
          continue;
        }
        throw err;
      } finally {
        client.release();
      }
    }
    throw new Error('No se pudo asignar numero de turno tras reintentos');
  }

  async getStatus(doctorId: string, queueDate: string): Promise<QueueStatus> {
    const [currentResult, waitingResult] = await Promise.all([
      this.pool.query<TurnRow>(
        `SELECT ${SELECT_COLUMNS} FROM turns WHERE doctor_id = $1 AND queue_date = $2 AND status = 'in-progress'`,
        [doctorId, queueDate],
      ),
      this.pool.query<TurnRow>(
        `SELECT ${QUALIFIED_TURN_COLUMNS} FROM turns t
         LEFT JOIN appointments a ON a.id = t.appointment_id
         WHERE t.doctor_id = $1 AND t.queue_date = $2 AND t.status = 'waiting'
           AND (a.id IS NULL OR a.status = 'CONFIRMED')
         ORDER BY (t.priority = 'preferente') DESC, COALESCE(a.created_at, t.created_at) ASC, t.number ASC`,
        [doctorId, queueDate],
      ),
    ]);

    const currentRow = currentResult.rows[0];
    return {
      current: currentRow ? toDomain(currentRow) : null,
      waiting: waitingResult.rows.map(toDomain),
    };
  }

  async findCurrent(doctorId: string, queueDate: string): Promise<Turn | null> {
    const result = await this.pool.query<TurnRow>(
      `SELECT ${SELECT_COLUMNS} FROM turns WHERE doctor_id = $1 AND queue_date = $2 AND status = 'in-progress'`,
      [doctorId, queueDate],
    );
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async callNext(doctorId: string, queueDate: string): Promise<TurnTransitionResult> {
    return this.transition(doctorId, queueDate, 'done');
  }

  async skip(doctorId: string, queueDate: string): Promise<TurnTransitionResult> {
    return this.transition(doctorId, queueDate, 'skipped');
  }

  private async transition(
    doctorId: string,
    queueDate: string,
    targetStatus: 'done' | 'skipped',
  ): Promise<TurnTransitionResult> {
    return withRetry(
      async () => {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');

          const finished = await this.finishCurrentTurn(client, doctorId, queueDate, targetStatus);
          const promoted = await this.promoteNextWaiting(client, doctorId, queueDate);

          await client.query('COMMIT');
          return { finished, promoted };
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
            throw new ConflictError('Ya existe un turno en curso para este doctor');
          }
          throw err;
        } finally {
          client.release();
        }
      },
      { retries: 10, isRetryable: isTransientConcurrencyError },
    );
  }

  private async finishCurrentTurn(
    client: PoolClient,
    doctorId: string,
    queueDate: string,
    targetStatus: 'done' | 'skipped',
  ): Promise<Turn | null> {
    const currentResult = await client.query<TurnRow>(
      `SELECT ${SELECT_COLUMNS} FROM turns
       WHERE doctor_id = $1 AND queue_date = $2 AND status = 'in-progress'
       FOR UPDATE`,
      [doctorId, queueDate],
    );
    const currentRow = currentResult.rows[0];
    if (!currentRow) return null;

    const updated = await client.query<TurnRow>(
      `UPDATE turns SET status = $1, finished_at = now() WHERE id = $2 RETURNING ${SELECT_COLUMNS}`,
      [targetStatus, currentRow.id],
    );
    const row = updated.rows[0];
    return row ? toDomain(row) : null;
  }

  private async promoteNextWaiting(
    client: PoolClient,
    doctorId: string,
    queueDate: string,
  ): Promise<Turn | null> {
    const nextResult = await client.query<TurnRow>(
      `SELECT ${QUALIFIED_TURN_COLUMNS} FROM turns t
       LEFT JOIN appointments a ON a.id = t.appointment_id
       WHERE t.doctor_id = $1 AND t.queue_date = $2 AND t.status = 'waiting'
         AND (a.id IS NULL OR a.status = 'CONFIRMED')
       ORDER BY (t.priority = 'preferente') DESC, COALESCE(a.created_at, t.created_at) ASC, t.number ASC
       LIMIT 1
       FOR UPDATE OF t SKIP LOCKED`,
      [doctorId, queueDate],
    );
    const nextRow = nextResult.rows[0];
    if (!nextRow) return null;

    const promoted = await client.query<TurnRow>(
      `UPDATE turns SET status = 'in-progress' WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [nextRow.id],
    );
    const row = promoted.rows[0];
    return row ? toDomain(row) : null;
  }
}
