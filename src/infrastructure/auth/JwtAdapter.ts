import jwt from 'jsonwebtoken';
import { TokenPayload, TokenService } from '../../domain/ports/TokenService';
import { UnauthorizedError } from '../../domain/errors/UnauthorizedError';
import { UserRole } from '../../domain/entities/User';

export class JwtAdapter implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn } as jwt.SignOptions);
  }

  verify(token: string): TokenPayload {
    let decoded: string | jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, this.secret);
    } catch {
      throw new UnauthorizedError('Token invalido o expirado');
    }

    if (typeof decoded === 'string' || !decoded['userId'] || !decoded['role']) {
      throw new UnauthorizedError('Token invalido o expirado');
    }

    return { userId: decoded['userId'] as string, role: decoded['role'] as UserRole };
  }
}
