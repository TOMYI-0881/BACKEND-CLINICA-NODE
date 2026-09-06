import { RegisterUser } from '../../../src/application/use-cases/RegisterUser';
import { LoginUser } from '../../../src/application/use-cases/LoginUser';
import { PasswordHasher } from '../../../src/domain/ports/PasswordHasher';
import { TokenService } from '../../../src/domain/ports/TokenService';
import { User } from '../../../src/domain/entities/User';
import { UnauthorizedError } from '../../../src/domain/errors/UnauthorizedError';
import { RegisterUserSchema } from '../../../src/application/dtos/RegisterUserDto';
import { makeUserRepo } from './mocks';

function makeHasher(): jest.Mocked<PasswordHasher> {
  return { hash: jest.fn(), compare: jest.fn() };
}

function makeTokens(): jest.Mocked<TokenService> {
  return { sign: jest.fn(), verify: jest.fn() };
}

describe('RegisterUser', () => {
  it('hashea la contrasena y guarda un usuario con rol PATIENT', async () => {
    const users = makeUserRepo();
    const hasher = makeHasher();
    hasher.hash.mockResolvedValue('hashed-pw');
    const savedUser = User.create({
      id: 'u1',
      email: 'paciente@test.com',
      passwordHash: 'hashed-pw',
      role: 'PATIENT',
      createdAt: new Date(),
      photoUrl: null,
      name: 'Juan Perez',
    });
    users.save.mockResolvedValue(savedUser);

    const useCase = new RegisterUser(users, hasher);
    const result = await useCase.execute({ email: 'paciente@test.com', password: 'plain123', name: 'Juan Perez' });

    expect(hasher.hash).toHaveBeenCalledWith('plain123');
    expect(users.save).toHaveBeenCalledWith({
      email: 'paciente@test.com',
      passwordHash: 'hashed-pw',
      role: 'PATIENT',
      name: 'Juan Perez',
    });
    expect(result).toBe(savedUser);
  });

  it('propaga el ConflictError del repositorio si el email ya existe', async () => {
    const users = makeUserRepo();
    const hasher = makeHasher();
    hasher.hash.mockResolvedValue('hashed-pw');
    users.save.mockRejectedValue(new Error('email duplicado'));

    const useCase = new RegisterUser(users, hasher);
    await expect(
      useCase.execute({ email: 'dup@test.com', password: 'plain123', name: 'Juan Perez' }),
    ).rejects.toThrow('email duplicado');
  });
});

describe('RegisterUserSchema (validacion de name)', () => {
  it('rechaza el registro sin name', () => {
    const result = RegisterUserSchema.safeParse({ email: 'paciente@test.com', password: 'plain123' });
    expect(result.success).toBe(false);
  });

  it('rechaza name de 1 caracter', () => {
    const result = RegisterUserSchema.safeParse({ email: 'paciente@test.com', password: 'plain123', name: 'A' });
    expect(result.success).toBe(false);
  });

  it('acepta un name valido y lo trimea', () => {
    const result = RegisterUserSchema.safeParse({
      email: 'paciente@test.com',
      password: 'plain123',
      name: '  Juan Perez  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Juan Perez');
  });
});

describe('LoginUser', () => {
  const user = User.create({
    id: 'u1',
    email: 'paciente@test.com',
    passwordHash: 'hashed-pw',
    role: 'PATIENT',
    createdAt: new Date(),
    photoUrl: null,
    name: 'Juan Perez',
  });

  it('retorna un token JWT cuando las credenciales son validas', async () => {
    const users = makeUserRepo();
    users.findByEmail.mockResolvedValue(user);
    const hasher = makeHasher();
    hasher.compare.mockResolvedValue(true);
    const tokens = makeTokens();
    tokens.sign.mockReturnValue('jwt-token');

    const useCase = new LoginUser(users, hasher, tokens);
    const result = await useCase.execute({ email: 'paciente@test.com', password: 'plain123' });

    expect(hasher.compare).toHaveBeenCalledWith('plain123', 'hashed-pw');
    expect(tokens.sign).toHaveBeenCalledWith({ userId: 'u1', role: 'PATIENT' });
    expect(result).toEqual({ token: 'jwt-token', user });
  });

  it('rechaza con UnauthorizedError si el usuario no existe', async () => {
    const users = makeUserRepo();
    users.findByEmail.mockResolvedValue(null);
    const useCase = new LoginUser(users, makeHasher(), makeTokens());

    await expect(useCase.execute({ email: 'noexiste@test.com', password: 'x' })).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('rechaza con UnauthorizedError si la contrasena es incorrecta', async () => {
    const users = makeUserRepo();
    users.findByEmail.mockResolvedValue(user);
    const hasher = makeHasher();
    hasher.compare.mockResolvedValue(false);
    const useCase = new LoginUser(users, hasher, makeTokens());

    await expect(useCase.execute({ email: 'paciente@test.com', password: 'wrong' })).rejects.toThrow(
      UnauthorizedError,
    );
  });
});
