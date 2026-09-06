import { User } from '../../domain/entities/User';
import { UserRepository } from '../../domain/ports/UserRepository';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { NotFoundError } from '../../domain/errors/NotFoundError';

export interface RemoveMyPhotoResult {
  user: User;
  previousPhotoUrl: string | null;
}

/** Contraparte de UpdateMyPhoto: quita la foto de perfil (users y, si aplica, doctors). */
export class RemoveMyPhoto {
  constructor(
    private readonly users: UserRepository,
    private readonly doctors: DoctorRepository,
  ) {}

  async execute(userId: string): Promise<RemoveMyPhotoResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuario no encontrado');

    const previousPhotoUrl = user.photoUrl;
    await this.users.updatePhotoUrl(userId, null);

    if (user.role === 'DOCTOR') {
      const doctor = await this.doctors.findByUserId(userId);
      if (doctor) await this.doctors.updatePhoto(doctor.id, null);
    }

    const updated = await this.users.findById(userId);
    if (!updated) throw new NotFoundError('Usuario no encontrado');
    return { user: updated, previousPhotoUrl };
  }
}
