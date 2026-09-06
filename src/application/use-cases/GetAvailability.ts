import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { computeFreeSlots, Slot } from '../../domain/entities/Availability';
import { GetAvailabilityDto } from '../dtos/GetAvailabilityDto';

export class GetAvailability {
  constructor(private readonly appointments: AppointmentRepository) {}

  async execute(dto: GetAvailabilityDto): Promise<Slot[]> {
    const blocking = await this.appointments.findBlockingByDoctorAndDate(dto.doctorId, dto.date);
    return computeFreeSlots(blocking, dto.date);
  }
}
