import { UpdateMyProfile } from '../../../src/application/use-cases/UpdateMyProfile';
import { User } from '../../../src/domain/entities/User';
import { ConflictError } from '../../../src/domain/errors/ConflictError';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeUserRepo } from './mocks';

function buildUser(name: string, email: string): User {
  return User.create({
    id: 'u1',
    email,
    passwordHash: 'hash',
    role: 'PATIENT',
    createdAt: new Date(),
    photoUrl: null,
    name,
  });
}

describe('UpdateMyProfile', () => {
  it('actualiza name/email y devuelve el usuario actualizado', async () => {
    const users = makeUserRepo();
    users.findById.mockResolvedValue(buildUser('Juan Perez', 'juan@test.com'));
    const updated = buildUser('Juan Actualizado', 'juan.nuevo@test.com');
    users.updateProfile.mockResolvedValue(updated);

    const useCase = new UpdateMyProfile(users);
    const result = await useCase.execute('u1', { name: 'Juan Actualizado', email: 'juan.nuevo@test.com' });

    expect(users.updateProfile).toHaveBeenCalledWith('u1', {
      name: 'Juan Actualizado',
      email: 'juan.nuevo@test.com',
    });
    expect(result).toBe(updated);
  });

  it('lanza NotFoundError si el usuario no existe', async () => {
    const users = makeUserRepo();
    users.findById.mockResolvedValue(null);

    const useCase = new UpdateMyProfile(users);
    await expect(
      useCase.execute('no-existe', { name: 'Juan Perez', email: 'juan@test.com' }),
    ).rejects.toThrow(NotFoundError);
    expect(users.updateProfile).not.toHaveBeenCalled();
  });

  it('propaga el ConflictError si el email pertenece a otro usuario', async () => {
    const users = makeUserRepo();
    users.findById.mockResolvedValue(buildUser('Juan Perez', 'juan@test.com'));
    users.updateProfile.mockRejectedValue(new ConflictError('El email ya esta registrado'));

    const useCase = new UpdateMyProfile(users);
    await expect(
      useCase.execute('u1', { name: 'Juan Perez', email: 'otro@test.com' }),
    ).rejects.toThrow(ConflictError);
  });
});
