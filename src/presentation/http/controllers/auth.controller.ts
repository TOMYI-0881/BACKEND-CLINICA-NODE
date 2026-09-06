import { RequestHandler } from 'express';
import { RegisterUser } from '../../../application/use-cases/RegisterUser';
import { LoginUser } from '../../../application/use-cases/LoginUser';
import { RegisterUserSchema } from '../../../application/dtos/RegisterUserDto';
import { LoginUserSchema } from '../../../application/dtos/LoginUserDto';
import { asyncHandler } from '../asyncHandler';

export interface AuthControllerDeps {
  registerUser: RegisterUser;
  loginUser: LoginUser;
}

export interface AuthController {
  register: RequestHandler;
  login: RequestHandler;
}

export function createAuthController(deps: AuthControllerDeps): AuthController {
  const register = asyncHandler(async (req, res) => {
    const dto = RegisterUserSchema.parse(req.body);
    const user = await deps.registerUser.execute(dto);
    res.status(201).json(user.toJSON());
  });

  const login = asyncHandler(async (req, res) => {
    const dto = LoginUserSchema.parse(req.body);
    const result = await deps.loginUser.execute(dto);
    res.status(200).json({ token: result.token, user: result.user.toJSON() });
  });

  return { register, login };
}
