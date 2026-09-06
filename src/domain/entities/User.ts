import { ValidationError } from '../errors/ValidationError';

export type UserRole = 'PATIENT' | 'ADMIN' | 'DOCTOR';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  photoUrl: string | null;
  name: string;
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

  get photoUrl(): string | null {
    return this.props.photoUrl;
  }

  // name puede venir '' (columna NOT NULL DEFAULT ''): las cuentas de doctor/admin no pasan
  // por RegisterUser (unico lugar que exige nombre, via RegisterUserSchema), asi que create()
  // no valida "obligatorio" aca -- romperia login/lectura de esas cuentas existentes.
  get name(): string {
    return this.props.name;
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
      photoUrl: this.props.photoUrl,
      name: this.props.name,
    };
  }
}
