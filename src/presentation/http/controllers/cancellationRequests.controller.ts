import { Request, RequestHandler } from 'express';
import { ListPendingCancellationRequests } from '../../../application/use-cases/ListPendingCancellationRequests';
import { ApproveCancellationRequest } from '../../../application/use-cases/ApproveCancellationRequest';
import { RejectCancellationRequest } from '../../../application/use-cases/RejectCancellationRequest';
import { TokenPayload } from '../../../domain/ports/TokenService';
import { UnauthorizedError } from '../../../domain/errors/UnauthorizedError';
import { asyncHandler } from '../asyncHandler';

export interface CancellationRequestsControllerDeps {
  listPendingCancellationRequests: ListPendingCancellationRequests;
  approveCancellationRequest: ApproveCancellationRequest;
  rejectCancellationRequest: RejectCancellationRequest;
}

export interface CancellationRequestsController {
  list: RequestHandler;
  approve: RequestHandler;
  reject: RequestHandler;
}

function requireUser(req: Request): TokenPayload {
  if (!req.user) throw new UnauthorizedError('No autenticado');
  return req.user;
}

/** Bandeja de ADMIN para revisar pedidos de cancelacion de los DOCTOR. */
export function createCancellationRequestsController(
  deps: CancellationRequestsControllerDeps,
): CancellationRequestsController {
  const list = asyncHandler(async (_req, res) => {
    const requests = await deps.listPendingCancellationRequests.execute();
    res.status(200).json(requests.map((request) => request.toJSON()));
  });

  const approve = asyncHandler(async (req, res) => {
    const admin = requireUser(req);
    const request = await deps.approveCancellationRequest.execute(req.params['id'] as string, admin.userId);
    res.status(200).json(request.toJSON());
  });

  const reject = asyncHandler(async (req, res) => {
    const admin = requireUser(req);
    const request = await deps.rejectCancellationRequest.execute(req.params['id'] as string, admin.userId);
    res.status(200).json(request.toJSON());
  });

  return { list, approve, reject };
}
