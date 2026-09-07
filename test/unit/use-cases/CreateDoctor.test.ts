import { CreateDoctor } from '../../../src/application/use-cases/CreateDoctor';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { makeDoctorRepo } from './mocks';
import { PasswordHasher } from '../../../src/domain/ports/PasswordHasher';

function makeHasher(): jest.Mocked<PasswordHasher> {
  return { hash: jest.fn(), compare: jest.fn() };
}

describe('CreateDoctor', () => {
  it('hashea la contrasena y crea la cuenta + perfil juntos', async () => {
    const doctors = makeDoctorRepo();
    const hasher = makeHasher();
    hasher.hash.mockResolvedValue('hashed-pw');
    const created = Doctor.create({
      id: 'doc-1',
      userId: 'user-1',
      name: 'Ana',
      specialty: 'Cardiologia',
      gender: 'female',
      isActive: true,
      createdAt: new Date(),
      photoUrl: null,
    });
    doctors.createDoctorAccount.mockResolvedValue(created);

    const useCase = new CreateDoctor(doctors, hasher);
    const result = await useCase.execute({
      name: 'Ana',
      specialty: 'Cardiologia',
      email: 'ana@test.com',
      password: 'plain123',
      gender: 'female',
    });

    expect(hasher.hash).toHaveBeenCalledWith('plain123');
    expect(doctors.createDoctorAccount).toHaveBeenCalledWith({
      name: 'Ana',
      specialty: 'Cardiologia',
      email: 'ana@test.com',
      passwordHash: 'hashed-pw',
      gender: 'female',
    });
    expect(result).toBe(created);
  });

  it('propaga el ConflictError del repositorio si el email ya existe', async () => {
    const doctors = makeDoctorRepo();
    const hasher = makeHasher();
    hasher.hash.mockResolvedValue('hashed-pw');
    doctors.createDoctorAccount.mockRejectedValue(new Error('email duplicado'));

    const useCase = new CreateDoctor(doctors, hasher);
    await expect(
      useCase.execute({
        name: 'Ana',
        specialty: 'Cardiologia',
        email: 'ana@test.com',
        password: 'plain123',
        gender: 'female',
      }),
    ).rejects.toThrow('email duplicado');
  });
});
