import { RequestHandler } from 'express';
import { RegisterUser } from '../../../application/use-cases/RegisterUser';
import { LoginUser } from '../../../application/use-cases/LoginUser';
import { GetMyProfile } from '../../../application/use-cases/GetMyProfile';
import { UpdateMyProfile } from '../../../application/use-cases/UpdateMyProfile';
import { UpdateMyPhoto } from '../../../application/use-cases/UpdateMyPhoto';
import { RemoveMyPhoto } from '../../../application/use-cases/RemoveMyPhoto';
import { RegisterUserSchema } from '../../../application/dtos/RegisterUserDto';
import { LoginUserSchema } from '../../../application/dtos/LoginUserDto';
import { UpdateMyProfileSchema } from '../../../application/dtos/UpdateMyProfileDto';
import { ValidationError } from '../../../domain/errors/ValidationError';
import { PhotoStorage } from '../../../domain/ports/PhotoStorage';
import { buildPhotoKey } from '../middlewares/upload.middleware';
import { asyncHandler } from '../asyncHandler';

export interface AuthControllerDeps {
  registerUser: RegisterUser;
  loginUser: LoginUser;
  getMyProfile: GetMyProfile;
  updateMyProfile: UpdateMyProfile;
  updateMyPhoto: UpdateMyPhoto;
  removeMyPhoto: RemoveMyPhoto;
  photoStorage: PhotoStorage;
}

export interface AuthController {
  register: RequestHandler;
  login: RequestHandler;
  me: RequestHandler;
  updateProfile: RequestHandler;
  uploadPhoto: RequestHandler;
  removePhoto: RequestHandler;
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

  const me = asyncHandler(async (req, res) => {
    const user = await deps.getMyProfile.execute(req.user!.userId);
    res.status(200).json(user.toJSON());
  });

  const updateProfile = asyncHandler(async (req, res) => {
    const dto = UpdateMyProfileSchema.parse(req.body);
    const user = await deps.updateMyProfile.execute(req.user!.userId, dto);
    res.status(200).json(user.toJSON());
  });

  const uploadPhoto = asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('La foto es obligatoria');
    const key = buildPhotoKey(req.user!.userId, req.file.mimetype);
    const photoUrl = await deps.photoStorage.upload(req.file.buffer, key, req.file.mimetype);
    const { user, previousPhotoUrl } = await deps.updateMyPhoto.execute(req.user!.userId, photoUrl);
    if (previousPhotoUrl && previousPhotoUrl !== photoUrl) void deps.photoStorage.delete(previousPhotoUrl);
    res.status(200).json(user.toJSON());
  });

  const removePhoto = asyncHandler(async (req, res) => {
    const { previousPhotoUrl } = await deps.removeMyPhoto.execute(req.user!.userId);
    void deps.photoStorage.delete(previousPhotoUrl);
    res.status(200).json({ ok: true });
  });

  return { register, login, me, updateProfile, uploadPhoto, removePhoto };
}
