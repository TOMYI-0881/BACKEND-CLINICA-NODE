import { User } from '../../domain/entities/User';
import { UserRepository } from '../../domain/ports/UserRepository';
import { NotFoundError } from '../../domain/errors/NotFoundError';
import { UpdateMyProfileDto } from '../dtos/UpdateMyProfileDto';

export class UpdateMyProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string, dto: UpdateMyProfileDto): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuario no encontrado');

    return this.users.updateProfile(userId, { name: dto.name, email: dto.email });
  }
}
