import { Request, RequestHandler } from 'express';
import { CreateAppointment } from '../../../application/use-cases/CreateAppointment';
import { CancelAppointment } from '../../../application/use-cases/CancelAppointment';
import { GetAvailability } from '../../../application/use-cases/GetAvailability';
import { ListAppointments } from '../../../application/use-cases/ListAppointments';
import { ListMyAppointments } from '../../../application/use-cases/ListMyAppointments';
import { RequestAppointmentCancellation } from '../../../application/use-cases/RequestAppointmentCancellation';
import { GetAvailabilitySchema } from '../../../application/dtos/GetAvailabilityDto';
import { CreateAppointmentSchema } from '../../../application/dtos/CreateAppointmentDto';
import { CancelAppointmentSchema } from '../../../application/dtos/CancelAppointmentDto';
import { ListAppointmentsSchema } from '../../../application/dtos/ListAppointmentsDto';
import { RequestCancellationSchema } from '../../../application/dtos/RequestCancellationDto';
import { TokenPayload } from '../../../domain/ports/TokenService';
import { UnauthorizedError } from '../../../domain/errors/UnauthorizedError';
import { asyncHandler } from '../asyncHandler';

export interface AppointmentsControllerDeps {
  createAppointment: CreateAppointment;
  cancelAppointment: CancelAppointment;
  getAvailability: GetAvailability;
  listAppointments: ListAppointments;
  listMyAppointments: ListMyAppointments;
  requestAppointmentCancellation: RequestAppointmentCancellation;
}

export interface AppointmentsController {
  availability: RequestHandler;
  create: RequestHandler;
  mine: RequestHandler;
  list: RequestHandler;
  cancel: RequestHandler;
  requestCancellation: RequestHandler;
}

function requireUser(req: Request): TokenPayload {
  if (!req.user) throw new UnauthorizedError('No autenticado');
  return req.user;
}

export function createAppointmentsController(deps: AppointmentsControllerDeps): AppointmentsController {
  const availability = asyncHandler(async (req, res) => {
    const dto = GetAvailabilitySchema.parse(req.query);
    const slots = await deps.getAvailability.execute(dto);
    res.status(200).json(slots);
  });

  const create = asyncHandler(async (req, res) => {
    const dto = CreateAppointmentSchema.parse(req.body);
    const user = requireUser(req);
    const appointment = await deps.createAppointment.execute(dto, user.userId);
    res.status(201).json(appointment.toJSON());
  });

  const mine = asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const appointments = await deps.listMyAppointments.execute({ userId: user.userId, role: user.role });
    res.status(200).json(appointments.map((appointment) => appointment.toJSON()));
  });

  const list = asyncHandler(async (req, res) => {
    const dto = ListAppointmentsSchema.parse(req.query);
    const result = await deps.listAppointments.execute(dto);
    res.status(200).json({
      items: result.items.map((appointment) => appointment.toJSON()),
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  });

  const cancel = asyncHandler(async (req, res) => {
    const dto = CancelAppointmentSchema.parse({ appointmentId: req.params['id'] });
    const user = requireUser(req);
    const cancelled = await deps.cancelAppointment.execute(dto, { userId: user.userId, role: user.role });
    res.status(200).json(cancelled.toJSON());
  });

  const requestCancellation = asyncHandler(async (req, res) => {
    const dto = RequestCancellationSchema.parse(req.body);
    const user = requireUser(req);
    const request = await deps.requestAppointmentCancellation.execute(
      user.userId,
      req.params['id'] as string,
      dto,
    );
    res.status(201).json(request.toJSON());
  });

  return { availability, create, mine, list, cancel, requestCancellation };
}
