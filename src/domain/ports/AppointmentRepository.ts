import { Appointment } from '../entities/Appointment';

export interface NewAppointmentData {
  doctorId: string;
  patientId: string;
  startTime: Date;
  endTime: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Puerto de persistencia de reservas. La garantia de no-solapamiento vive en el
 * EXCLUDE constraint de Postgres (seccion 5/9.1 del documento maestro): la
 * implementacion debe capturar el codigo 23P01 (exclusion_violation) y lanzar
 * ConflictError, nunca reimplementar la verificacion de solapamiento en codigo.
 */
export interface AppointmentRepository {
  /** @throws ConflictError si el horario se superpone con otra reserva CONFIRMED/CANCELLATION_REQUESTED del mismo doctor. */
  save(data: NewAppointmentData): Promise<Appointment>;
  findById(id: string): Promise<Appointment | null>;
  findByPatient(patientId: string): Promise<Appointment[]>;
  /** Todas las reservas (cualquier status) de un doctor, mas recientes primero. Usado por GET /appointments/mine para DOCTOR. */
  findByDoctor(doctorId: string): Promise<Appointment[]>;
  findAll(params: { page: number; limit: number }): Promise<PaginatedResult<Appointment>>;
  /**
   * Reservas de un doctor en una fecha que ocupan el horario (CONFIRMED y
   * CANCELLATION_REQUESTED -- esta ultima todavia no esta liberada, ver AI-CONTEXT.md),
   * usadas para calcular huecos libres.
   */
  findBlockingByDoctorAndDate(doctorId: string, date: string): Promise<Appointment[]>;
  /** Reservas CONFIRMED de un doctor con startTime posterior a `from`. Usado al desactivar un doctor. */
  findFutureConfirmedByDoctor(doctorId: string, from: Date): Promise<Appointment[]>;
  /** @throws NotFoundError si la reserva no existe. */
  cancel(id: string): Promise<Appointment>;
}
