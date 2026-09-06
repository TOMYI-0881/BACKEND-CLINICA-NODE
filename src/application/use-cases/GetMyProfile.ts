import { User } from '../../domain/entities/User';
import { UserRepository } from '../../domain/ports/UserRepository';
import { NotFoundError } from '../../domain/errors/NotFoundError';

export class GetMyProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return user;
  }
}
