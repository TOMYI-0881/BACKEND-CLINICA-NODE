import { RemoveMyPhoto } from '../../../src/application/use-cases/RemoveMyPhoto';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { User } from '../../../src/domain/entities/User';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeUserRepo, makeDoctorRepo } from './mocks';

function buildUser(role: 'PATIENT' | 'DOCTOR', photoUrl: string | null): User {
  return User.create({
    id: 'u1',
    email: 'user@test.com',
    passwordHash: 'hash',
    role,
    createdAt: new Date(),
    photoUrl,
    name: 'Juan Perez',
  });
}

function buildDoctor(): Doctor {
  return Doctor.create({
    id: 'doc-1',
    userId: 'u1',
    name: 'Dr. Test',
    specialty: 'Cardiologia',
    isActive: true,
    createdAt: new Date(),
    photoUrl: '/uploads/photos/old.jpg',
  });
}

describe('RemoveMyPhoto', () => {
  it('borra la foto del usuario y retorna la anterior', async () => {
    const users = makeUserRepo();
    users.findById
      .mockResolvedValueOnce(buildUser('PATIENT', '/uploads/photos/old.jpg'))
      .mockResolvedValueOnce(buildUser('PATIENT', null));
    const doctors = makeDoctorRepo();

    const useCase = new RemoveMyPhoto(users, doctors);
    const result = await useCase.execute('u1');

    expect(users.updatePhotoUrl).toHaveBeenCalledWith('u1', null);
    expect(result.previousPhotoUrl).toBe('/uploads/photos/old.jpg');
    expect(result.user.photoUrl).toBeNull();
  });

  it('si el usuario es DOCTOR, tambien borra la foto de su perfil publico', async () => {
    const users = makeUserRepo();
    users.findById
      .mockResolvedValueOnce(buildUser('DOCTOR', '/uploads/photos/old.jpg'))
      .mockResolvedValueOnce(buildUser('DOCTOR', null));
    const doctors = makeDoctorRepo();
    doctors.findByUserId.mockResolvedValue(buildDoctor());

    const useCase = new RemoveMyPhoto(users, doctors);
    await useCase.execute('u1');

    expect(doctors.updatePhoto).toHaveBeenCalledWith('doc-1', null);
  });

  it('lanza NotFoundError si el usuario no existe', async () => {
    const users = makeUserRepo();
    users.findById.mockResolvedValue(null);
    const doctors = makeDoctorRepo();

    const useCase = new RemoveMyPhoto(users, doctors);
    await expect(useCase.execute('no-existe')).rejects.toThrow(NotFoundError);
  });
});
