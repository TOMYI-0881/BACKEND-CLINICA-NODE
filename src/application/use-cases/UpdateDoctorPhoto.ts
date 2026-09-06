import { Doctor } from '../../domain/entities/Doctor';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { NotFoundError } from '../../domain/errors/NotFoundError';

export interface UpdateDoctorPhotoResult {
  doctor: Doctor;
  previousPhotoUrl: string | null;
}

/**
 * Contraparte de UpdateMyPhoto para cuando quien sube la foto es un ADMIN (no el propio
 * doctor). Escribe en users y en doctors para no perder la coherencia users.photo_url <->
 * doctors.photo_url que ya mantiene UpdateMyPhoto.
 */
export class UpdateDoctorPhoto {
  constructor(
    private readonly doctors: DoctorRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(doctorId: string, photoUrl: string): Promise<UpdateDoctorPhotoResult> {
    const doctor = await this.doctors.findById(doctorId);
    if (!doctor) throw new NotFoundError('Doctor no encontrado');

    const previousPhotoUrl = doctor.photoUrl;
    await this.users.updatePhotoUrl(doctor.userId, photoUrl);
    await this.doctors.updatePhoto(doctorId, photoUrl);

    const updated = await this.doctors.findById(doctorId);
    if (!updated) throw new NotFoundError('Doctor no encontrado');
    return { doctor: updated, previousPhotoUrl };
  }
}
