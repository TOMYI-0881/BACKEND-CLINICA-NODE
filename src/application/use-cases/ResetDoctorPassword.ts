import { randomBytes } from 'crypto';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { UserRepository } from '../../domain/ports/UserRepository';
import { PasswordHasher } from '../../domain/ports/PasswordHasher';
import { EmailService } from '../../domain/ports/EmailService';
import { NotFoundError } from '../../domain/errors/NotFoundError';
import { logError } from '../logError';

function generateTemporaryPassword(): string {
  return randomBytes(9).toString('base64url');
}

/** ADMIN resetea la contrasena de un doctor: genera una nueva y se la envia por email. */
export class ResetDoctorPassword {
  constructor(
    private readonly doctors: DoctorRepository,
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly email: EmailService,
  ) {}

  async execute(doctorId: string): Promise<void> {
    const doctor = await this.doctors.findById(doctorId);
    if (!doctor) throw new NotFoundError('Doctor no encontrado');

    const user = await this.users.findById(doctor.userId);
    if (!user) throw new NotFoundError('Cuenta del doctor no encontrada');

    const newPassword = generateTemporaryPassword();
    const passwordHash = await this.hasher.hash(newPassword);
    await this.users.updatePasswordHash(user.id, passwordHash);

    this.email
      .send(
        user.email,
        'Tu contrasena fue restablecida',
        `Tu nueva contrasena temporal es: ${newPassword}\n\nTe recomendamos cambiarla apenas inicies sesion.`,
      )
      .catch(logError);
  }
}
