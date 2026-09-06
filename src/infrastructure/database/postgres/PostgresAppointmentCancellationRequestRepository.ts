import { Pool } from 'pg';
import { CancellationRequest, CancellationRequestStatus } from '../../../domain/entities/CancellationRequest';
import {
  AppointmentCancellationRequestRepository,
  NewCancellationRequestData,
} from '../../../domain/ports/AppointmentCancellationRequestRepository';
import { ConflictError } from '../../../domain/errors/ConflictError';
import { NotFoundError } from '../../../domain/errors/NotFoundError';
import { ValidationError } from '../../../domain/errors/ValidationError';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from './pgErrors';

interface RequestRow {
  id: string;
  appointment_id: string;
  requested_by: string;
  reason: string;
  status: CancellationRequestStatus;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

const SELECT_COLUMNS =
  'id, appointment_id, requested_by, reason, status, resolved_by, resolved_at, created_at';

function toDomain(row: RequestRow): CancellationRequest {
  return CancellationRequest.create({
    id: row.id,
    appointmentId: row.appointment_id,
    requestedBy: row.requested_by,
    reason: row.reason,
    status: row.status,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  });
}

/**
 * `create` y `resolve` tocan tanto `appointment_cancellation_requests` como `appointments`
 * dentro de una unica transaccion -- nunca dejar la cita en CANCELLATION_REQUESTED sin un
 * registro de pedido (o viceversa) si algo falla a mitad de camino.
 */
export class PostgresAppointmentCancellationRequestRepository implements AppointmentCancellationRequestRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: NewCancellationRequestData): Promise<CancellationRequest> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const appointmentResult = await client.query(
        `UPDATE appointments SET status = 'CANCELLATION_REQUESTED' WHERE id = $1 AND status = 'CONFIRMED'`,
        [data.appointmentId],
      );

      if (appointmentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        const existing = await this.pool.query<{ id: string }>('SELECT id FROM appointments WHERE id = $1', [
          data.appointmentId,
        ]);
        if (existing.rowCount === 0) throw new NotFoundError('Reserva no encontrada');
        throw new ValidationError('Solo se puede pedir la cancelacion de una cita CONFIRMED');
      }

      const requestResult = await client.query<RequestRow>(
        `INSERT INTO appointment_cancellation_requests (appointment_id, requested_by, reason)
         VALUES ($1, $2, $3)
         RETURNING ${SELECT_COLUMNS}`,
        [data.appointmentId, data.requestedBy, data.reason],
      );
      const row = requestResult.rows[0];
      if (!row) throw new Error('INSERT no devolvio fila');

      await client.query('COMMIT');
      return toDomain(row);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
        throw new ConflictError('Ya existe un pedido de cancelacion pendiente para esta cita');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<CancellationRequest | null> {
    const result = await this.pool.query<RequestRow>(
      `SELECT ${SELECT_COLUMNS} FROM appointment_cancellation_requests WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async findAllPending(): Promise<CancellationRequest[]> {
    const result = await this.pool.query<RequestRow>(
      `SELECT ${SELECT_COLUMNS} FROM appointment_cancellation_requests
       WHERE status = 'pending' ORDER BY created_at ASC`,
    );
    return result.rows.map(toDomain);
  }

  async resolve(
    id: string,
    status: Exclude<CancellationRequestStatus, 'pending'>,
    resolvedBy: string,
  ): Promise<CancellationRequest> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const requestResult = await client.query<RequestRow>(
        `UPDATE appointment_cancellation_requests
         SET status = $2, resolved_by = $3, resolved_at = now()
         WHERE id = $1 AND status = 'pending'
         RETURNING ${SELECT_COLUMNS}`,
        [id, status, resolvedBy],
      );
      const row = requestResult.rows[0];

      if (!row) {
        await client.query('ROLLBACK');
        const existing = await this.findById(id);
        if (!existing) throw new NotFoundError('Pedido de cancelacion no encontrado');
        throw new ValidationError('Este pedido de cancelacion ya fue resuelto');
      }

      const newAppointmentStatus = status === 'approved' ? 'CANCELLED' : 'CONFIRMED';
      await client.query(
        `UPDATE appointments SET status = $2 WHERE id = $1 AND status = 'CANCELLATION_REQUESTED'`,
        [row.appointment_id, newAppointmentStatus],
      );

      await client.query('COMMIT');
      return toDomain(row);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
