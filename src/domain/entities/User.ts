import { ValidationError } from '../errors/ValidationError';

export type UserRole = 'PATIENT' | 'ADMIN' | 'DOCTOR';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(props: UserProps): User {
    if (!props.email.includes('@')) {
      throw new ValidationError('El email del usuario no es valido');
    }
    if (!props.passwordHash) {
      throw new ValidationError('El usuario debe tener un hash de password');
    }
    if (props.role !== 'PATIENT' && props.role !== 'ADMIN' && props.role !== 'DOCTOR') {
      throw new ValidationError('Rol de usuario invalido');
    }
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  isAdmin(): boolean {
    return this.props.role === 'ADMIN';
  }

  toJSON(): Omit<UserProps, 'passwordHash'> {
    return {
      id: this.props.id,
      email: this.props.email,
      role: this.props.role,
      createdAt: this.props.createdAt,
    };
  }
}
