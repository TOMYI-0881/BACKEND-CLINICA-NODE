import { UpdateMyPhoto } from '../../../src/application/use-cases/UpdateMyPhoto';
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
    photoUrl: null,
  });
}

describe('UpdateMyPhoto', () => {
  it('actualiza la foto del usuario y retorna la anterior', async () => {
    const users = makeUserRepo();
    users.findById
      .mockResolvedValueOnce(buildUser('PATIENT', null))
      .mockResolvedValueOnce(buildUser('PATIENT', '/uploads/photos/u1-new.jpg'));
    const doctors = makeDoctorRepo();

    const useCase = new UpdateMyPhoto(users, doctors);
    const result = await useCase.execute('u1', '/uploads/photos/u1-new.jpg');

    expect(users.updatePhotoUrl).toHaveBeenCalledWith('u1', '/uploads/photos/u1-new.jpg');
    expect(doctors.findByUserId).not.toHaveBeenCalled();
    expect(result.previousPhotoUrl).toBeNull();
    expect(result.user.photoUrl).toBe('/uploads/photos/u1-new.jpg');
  });

  it('si el usuario es DOCTOR, replica la foto en su perfil publico de doctors', async () => {
    const users = makeUserRepo();
    users.findById
      .mockResolvedValueOnce(buildUser('DOCTOR', '/uploads/photos/old.jpg'))
      .mockResolvedValueOnce(buildUser('DOCTOR', '/uploads/photos/new.jpg'));
    const doctors = makeDoctorRepo();
    doctors.findByUserId.mockResolvedValue(buildDoctor());

    const useCase = new UpdateMyPhoto(users, doctors);
    const result = await useCase.execute('u1', '/uploads/photos/new.jpg');

    expect(doctors.updatePhoto).toHaveBeenCalledWith('doc-1', '/uploads/photos/new.jpg');
    expect(result.previousPhotoUrl).toBe('/uploads/photos/old.jpg');
  });

  it('lanza NotFoundError si el usuario no existe', async () => {
    const users = makeUserRepo();
    users.findById.mockResolvedValue(null);
    const doctors = makeDoctorRepo();

    const useCase = new UpdateMyPhoto(users, doctors);
    await expect(useCase.execute('no-existe', '/uploads/photos/x.jpg')).rejects.toThrow(NotFoundError);
  });
});
