import { GetMyProfile } from '../../../src/application/use-cases/GetMyProfile';
import { User } from '../../../src/domain/entities/User';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeUserRepo } from './mocks';

function buildUser(): User {
  return User.create({
    id: 'u1',
    email: 'paciente@test.com',
    passwordHash: 'hash',
    role: 'PATIENT',
    createdAt: new Date(),
    photoUrl: '/uploads/photos/u1-123.jpg',
    name: 'Juan Perez',
  });
}

describe('GetMyProfile', () => {
  it('retorna el usuario autenticado', async () => {
    const users = makeUserRepo();
    users.findById.mockResolvedValue(buildUser());

    const useCase = new GetMyProfile(users);
    const result = await useCase.execute('u1');

    expect(users.findById).toHaveBeenCalledWith('u1');
    expect(result.photoUrl).toBe('/uploads/photos/u1-123.jpg');
  });

  it('lanza NotFoundError si el usuario no existe', async () => {
    const users = makeUserRepo();
    users.findById.mockResolvedValue(null);

    const useCase = new GetMyProfile(users);
    await expect(useCase.execute('no-existe')).rejects.toThrow(NotFoundError);
  });
});
