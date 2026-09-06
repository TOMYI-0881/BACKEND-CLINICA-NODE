import { AppointmentRepository, PaginatedResult } from '../../domain/ports/AppointmentRepository';
import { Appointment } from '../../domain/entities/Appointment';
import { ListAppointmentsDto } from '../dtos/ListAppointmentsDto';

/** Listado paginado para ADMIN (GET /appointments). La restriccion de rol vive en presentation. */
export class ListAppointments {
  constructor(private readonly repo: AppointmentRepository) {}

  async execute(dto: ListAppointmentsDto): Promise<PaginatedResult<Appointment>> {
    return this.repo.findAll({ page: dto.page, limit: dto.limit });
  }
}
