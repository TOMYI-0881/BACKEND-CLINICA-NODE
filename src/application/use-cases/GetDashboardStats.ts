import { AppointmentRepository, DashboardStats } from '../../domain/ports/AppointmentRepository';

export class GetDashboardStats {
  constructor(private readonly appointments: AppointmentRepository) {}

  async execute(): Promise<DashboardStats> {
    return this.appointments.getDashboardStats();
  }
}
