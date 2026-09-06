import { User } from '../../domain/entities/User';
import { UserRepository } from '../../domain/ports/UserRepository';
import { PasswordHasher } from '../../domain/ports/PasswordHasher';
import { RegisterUserDto } from '../dtos/RegisterUserDto';

export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(dto: RegisterUserDto): Promise<User> {
    const passwordHash = await this.hasher.hash(dto.password);
    return this.users.save({ email: dto.email, passwordHash, role: 'PATIENT', name: dto.name });
  }
}
