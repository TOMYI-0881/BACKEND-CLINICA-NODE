import { Doctor } from '../../../src/domain/entities/Doctor';
import { ValidationError } from '../../../src/domain/errors/ValidationError';

const baseProps = {
  id: 'doc-1',
  userId: 'user-1',
  isActive: true,
  createdAt: new Date(),
  photoUrl: null,
};

describe('Doctor', () => {
  it('crea un doctor valido', () => {
    const doctor = Doctor.create({ ...baseProps, name: 'Dra. Ana Perez', specialty: 'Cardiologia' });
    expect(doctor.name).toBe('Dra. Ana Perez');
    expect(doctor.userId).toBe('user-1');
    expect(doctor.isActive).toBe(true);
  });

  it('rechaza nombre vacio', () => {
    expect(() => Doctor.create({ ...baseProps, name: '  ', specialty: 'Cardiologia' })).toThrow(ValidationError);
  });

  it('rechaza especialidad vacia', () => {
    expect(() => Doctor.create({ ...baseProps, name: 'Dra. Ana Perez', specialty: '' })).toThrow(ValidationError);
  });
});
