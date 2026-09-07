import { Doctor } from '../../../src/domain/entities/Doctor';
import { ValidationError } from '../../../src/domain/errors/ValidationError';

const baseProps = {
  id: 'doc-1',
  userId: 'user-1',
  gender: 'female' as const,
  isActive: true,
  createdAt: new Date(),
  photoUrl: null,
};

describe('Doctor', () => {
  it('crea un doctor valido', () => {
    const doctor = Doctor.create({ ...baseProps, name: 'Ana Perez', specialty: 'Cardiologia' });
    expect(doctor.name).toBe('Ana Perez');
    expect(doctor.userId).toBe('user-1');
    expect(doctor.isActive).toBe(true);
  });

  it('rechaza nombre vacio', () => {
    expect(() => Doctor.create({ ...baseProps, name: '  ', specialty: 'Cardiologia' })).toThrow(ValidationError);
  });

  it('rechaza especialidad vacia', () => {
    expect(() => Doctor.create({ ...baseProps, name: 'Ana Perez', specialty: '' })).toThrow(ValidationError);
  });

  it('rechaza genero invalido', () => {
    expect(() =>
      Doctor.create({ ...baseProps, name: 'Ana Perez', specialty: 'Cardiologia', gender: 'other' as never }),
    ).toThrow(ValidationError);
  });
});
