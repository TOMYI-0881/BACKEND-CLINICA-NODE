import { User } from '../../../src/domain/entities/User';
import { ValidationError } from '../../../src/domain/errors/ValidationError';

const baseProps = {
  id: 'u-1',
  email: 'paciente@test.com',
  passwordHash: 'hashed',
  role: 'PATIENT' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('User', () => {
  it('crea un usuario valido', () => {
    const user = User.create(baseProps);
    expect(user.email).toBe('paciente@test.com');
    expect(user.isAdmin()).toBe(false);
  });

  it('rechaza un email sin @', () => {
    expect(() => User.create({ ...baseProps, email: 'invalido' })).toThrow(ValidationError);
  });

  it('rechaza un passwordHash vacio', () => {
    expect(() => User.create({ ...baseProps, passwordHash: '' })).toThrow(ValidationError);
  });

  it('toJSON() nunca expone el passwordHash', () => {
    const user = User.create(baseProps);
    const json = user.toJSON();
    expect(json).not.toHaveProperty('passwordHash');
  });
});
