import { Doctor } from '../../domain/entities/Doctor';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { UpdateDoctorDto } from '../dtos/UpdateDoctorDto';

export class UpdateDoctor {
  constructor(private readonly doctors: DoctorRepository) {}

  async execute(doctorId: string, dto: UpdateDoctorDto): Promise<Doctor> {
    return this.doctors.update(doctorId, dto);
  }
}
