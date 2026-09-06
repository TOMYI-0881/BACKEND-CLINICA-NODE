import { Doctor } from '../../domain/entities/Doctor';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { NotFoundError } from '../../domain/errors/NotFoundError';

export interface RemoveDoctorPhotoResult {
  doctor: Doctor;
  previousPhotoUrl: string | null;
}

/** Contraparte de UpdateDoctorPhoto: quita la foto del doctor (users y doctors). */
export class RemoveDoctorPhoto {
  constructor(
    private readonly doctors: DoctorRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(doctorId: string): Promise<RemoveDoctorPhotoResult> {
    const doctor = await this.doctors.findById(doctorId);
    if (!doctor) throw new NotFoundError('Doctor no encontrado');

    const previousPhotoUrl = doctor.photoUrl;
    await this.users.updatePhotoUrl(doctor.userId, null);
    await this.doctors.updatePhoto(doctorId, null);

    const updated = await this.doctors.findById(doctorId);
    if (!updated) throw new NotFoundError('Doctor no encontrado');
    return { doctor: updated, previousPhotoUrl };
  }
}
