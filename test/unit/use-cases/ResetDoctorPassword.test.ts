import { ResetDoctorPassword } from '../../../src/application/use-cases/ResetDoctorPassword';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { User } from '../../../src/domain/entities/User';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeDoctorRepo, makeUserRepo, makeEmailService } from './mocks';
import { PasswordHasher } from '../../../src/domain/ports/PasswordHasher';

function makeHasher(): jest.Mocked<PasswordHasher> {
  return { hash: jest.fn(), compare: jest.fn() };
}

function buildDoctor(): Doctor {
  return Doctor.create({
    id: 'doc-1',
    userId: 'user-doc-1',
    name: 'Dr. Reset',
    specialty: 'Cardiologia',
    gender: 'male',
    isActive: true,
    createdAt: new Date(),
    photoUrl: null,
  });
}

function buildDoctorUser(): User {
  return User.create({
    id: 'user-doc-1',
    email: 'doctor@test.com',
    passwordHash: 'old-hash',
    role: 'DOCTOR',
    createdAt: new Date(),
    photoUrl: null,
    name: '',
  });
}

describe('ResetDoctorPassword', () => {
  it('genera una nueva contrasena, la persiste hasheada, y la envia por email al doctor', async () => {
    const doctors = makeDoctorRepo();
    doctors.findById.mockResolvedValue(buildDoctor());
    const users = makeUserRepo();
    users.findById.mockResolvedValue(buildDoctorUser());
    const hasher = makeHasher();
    hasher.hash.mockResolvedValue('new-hashed-pw');
    const email = makeEmailService();

    const useCase = new ResetDoctorPassword(doctors, users, hasher, email);
    await useCase.execute('doc-1');
    await Promise.resolve();

    expect(users.updatePasswordHash).toHaveBeenCalledWith('user-doc-1', 'new-hashed-pw');
    expect(email.send).toHaveBeenCalledWith('doctor@test.com', expect.any(String), expect.any(String));
  });

  it('lanza NotFoundError si el doctor no existe', async () => {
    const doctors = makeDoctorRepo();
    doctors.findById.mockResolvedValue(null);

    const useCase = new ResetDoctorPassword(doctors, makeUserRepo(), makeHasher(), makeEmailService());
    await expect(useCase.execute('no-existe')).rejects.toThrow(NotFoundError);
  });
});
