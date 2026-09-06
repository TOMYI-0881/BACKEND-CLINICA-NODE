import { Doctor } from '../../domain/entities/Doctor';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';

export class ListDoctors {
  constructor(private readonly doctors: DoctorRepository) {}

  async execute(): Promise<Doctor[]> {
    return this.doctors.findAll();
  }
}
