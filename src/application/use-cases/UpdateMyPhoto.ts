import { User } from '../../domain/entities/User';
import { UserRepository } from '../../domain/ports/UserRepository';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { NotFoundError } from '../../domain/errors/NotFoundError';

export interface UpdateMyPhotoResult {
  user: User;
  previousPhotoUrl: string | null;
}

/**
 * Reemplaza la foto de perfil del usuario (unica, opcional). Si el usuario es DOCTOR,
 * replica la foto en su perfil publico (doctors.photo_url) para que GET /doctors no
 * necesite un JOIN contra users -- mismo patron de "tocar doctors + users" que
 * ResetDoctorPassword/DeactivateDoctor.
 */
export class UpdateMyPhoto {
  constructor(
    private readonly users: UserRepository,
    private readonly doctors: DoctorRepository,
  ) {}

  async execute(userId: string, photoUrl: string): Promise<UpdateMyPhotoResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuario no encontrado');

    const previousPhotoUrl = user.photoUrl;
    await this.users.updatePhotoUrl(userId, photoUrl);

    if (user.role === 'DOCTOR') {
      const doctor = await this.doctors.findByUserId(userId);
      if (doctor) await this.doctors.updatePhoto(doctor.id, photoUrl);
    }

    const updated = await this.users.findById(userId);
    if (!updated) throw new NotFoundError('Usuario no encontrado');
    return { user: updated, previousPhotoUrl };
  }
}
