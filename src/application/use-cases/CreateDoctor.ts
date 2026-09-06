import { Doctor } from '../../domain/entities/Doctor';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { PasswordHasher } from '../../domain/ports/PasswordHasher';
import { CreateDoctorDto } from '../dtos/CreateDoctorDto';

export class CreateDoctor {
  constructor(
    private readonly doctors: DoctorRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(dto: CreateDoctorDto): Promise<Doctor> {
    const passwordHash = await this.hasher.hash(dto.password);
    return this.doctors.createDoctorAccount({
      name: dto.name,
      specialty: dto.specialty,
      email: dto.email,
      passwordHash,
    });
  }
}
