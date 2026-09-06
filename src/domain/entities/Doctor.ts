import { ValidationError } from '../errors/ValidationError';

export interface DoctorProps {
  id: string;
  userId: string;
  name: string;
  specialty: string;
  isActive: boolean;
  createdAt: Date;
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

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toJSON(): DoctorProps {
    return { ...this.props };
  }
}
