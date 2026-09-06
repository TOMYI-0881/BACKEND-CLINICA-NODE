import { RequestHandler } from 'express';
import { CreateDoctor } from '../../../application/use-cases/CreateDoctor';
import { ListDoctors } from '../../../application/use-cases/ListDoctors';
import { UpdateDoctor } from '../../../application/use-cases/UpdateDoctor';
import { DeactivateDoctor } from '../../../application/use-cases/DeactivateDoctor';
import { ResetDoctorPassword } from '../../../application/use-cases/ResetDoctorPassword';
import { CreateDoctorSchema } from '../../../application/dtos/CreateDoctorDto';
import { UpdateDoctorSchema } from '../../../application/dtos/UpdateDoctorDto';
import { asyncHandler } from '../asyncHandler';

export interface DoctorsControllerDeps {
  createDoctor: CreateDoctor;
  listDoctors: ListDoctors;
  updateDoctor: UpdateDoctor;
  deactivateDoctor: DeactivateDoctor;
  resetDoctorPassword: ResetDoctorPassword;
}

export interface DoctorsController {
  create: RequestHandler;
  list: RequestHandler;
  update: RequestHandler;
  deactivate: RequestHandler;
  resetPassword: RequestHandler;
}

export function createDoctorsController(deps: DoctorsControllerDeps): DoctorsController {
  const create = asyncHandler(async (req, res) => {
    const dto = CreateDoctorSchema.parse(req.body);
    const doctor = await deps.createDoctor.execute(dto);
    res.status(201).json(doctor.toJSON());
  });

  const list = asyncHandler(async (_req, res) => {
    const doctors = await deps.listDoctors.execute();
    res.status(200).json(doctors.map((doctor) => doctor.toJSON()));
  });

  const update = asyncHandler(async (req, res) => {
    const dto = UpdateDoctorSchema.parse(req.body);
    const doctor = await deps.updateDoctor.execute(req.params['id'] as string, dto);
    res.status(200).json(doctor.toJSON());
  });

  const deactivate = asyncHandler(async (req, res) => {
    const doctor = await deps.deactivateDoctor.execute(req.params['id'] as string);
    res.status(200).json(doctor.toJSON());
  });

  const resetPassword = asyncHandler(async (req, res) => {
    await deps.resetDoctorPassword.execute(req.params['id'] as string);
    res.status(200).json({ ok: true });
  });

  return { create, list, update, deactivate, resetPassword };
}
