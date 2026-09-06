import { NextFunction, Request, RequestHandler, Response } from 'express';
import { UserRole } from '../../../domain/entities/User';
import { DoctorRepository } from '../../../domain/ports/DoctorRepository';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError';
import { UnauthorizedError } from '../../../domain/errors/UnauthorizedError';
import { asyncHandler } from '../asyncHandler';

/** Debe montarse siempre despues de authMiddleware. 401 si no hay usuario, 403 si el rol no alcanza. */
export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('No autenticado'));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('No tenes permisos para esta accion'));
      return;
    }
    next();
  };
}

/**
 * ADMIN puede operar la cola de cualquier doctor; un DOCTOR solo la propia (comparando el
 * `:doctorId` de la ruta contra el perfil de doctor vinculado a su cuenta). `extraAllowedRoles`
 * deja pasar otros roles sin chequeo de ownership (ej. PATIENT en check-in, que se anota a si
 * mismo). Cualquier otro caso, 403. `requireRole` sola no alcanza aca porque depende de un
 * dato del recurso (a que doctor pertenece la cuenta), no solo del rol.
 */
export function requireAdminOrOwnDoctor(doctors: DoctorRepository, extraAllowedRoles: UserRole[] = []): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) throw new UnauthorizedError('No autenticado');

    if (req.user.role === 'ADMIN' || extraAllowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    if (req.user.role === 'DOCTOR') {
      const doctor = await doctors.findByUserId(req.user.userId);
      if (doctor && doctor.id === req.params['doctorId']) {
        next();
        return;
      }
    }

    throw new ForbiddenError('No tenes permisos para operar la cola de este doctor');
  });
}
