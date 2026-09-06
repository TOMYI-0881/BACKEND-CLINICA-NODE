import { UserRepository } from '../../domain/ports/UserRepository';
import { PasswordHasher } from '../../domain/ports/PasswordHasher';
import { TokenService } from '../../domain/ports/TokenService';
import { UnauthorizedError } from '../../domain/errors/UnauthorizedError';
import { LoginUserDto } from '../dtos/LoginUserDto';
import { User } from '../../domain/entities/User';

export interface LoginResult {
  token: string;
  user: User;
}

export class LoginUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(dto: LoginUserDto): Promise<LoginResult> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedError('Credenciales invalidas');
    }

    const validPassword = await this.hasher.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Credenciales invalidas');
    }

    const token = this.tokens.sign({ userId: user.id, role: user.role });
    return { token, user };
  }
}
