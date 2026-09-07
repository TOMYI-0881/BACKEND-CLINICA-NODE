import { ValidationError } from '../errors/ValidationError';

export type DoctorGender = 'male' | 'female';

export interface DoctorProps {
  id: string;
  userId: string;
  name: string;
  specialty: string;
  gender: DoctorGender;
  isActive: boolean;
  createdAt: Date;
  photoUrl: string | null;
}

export class Doctor {
  private constructor(private readonly props: DoctorProps) {}

  static create(props: DoctorProps): Doctor {
    if (!props.name.trim()) {
      throw new ValidationError('El doctor debe tener un nombre');
    }
    if (!props.specialty.trim()) {
      throw new ValidationError('El doctor debe tener una especialidad');
    }
    if (props.gender !== 'male' && props.gender !== 'female') {
      throw new ValidationError('Genero de doctor invalido');
    }
    return new Doctor(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get name(): string {
    return this.props.name;
  }

  get specialty(): string {
    return this.props.specialty;
  }

  get gender(): DoctorGender {
    return this.props.gender;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get photoUrl(): string | null {
    return this.props.photoUrl;
  }

  toJSON(): DoctorProps {
    return { ...this.props };
  }
}
