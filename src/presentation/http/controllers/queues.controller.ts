import { RequestHandler } from 'express';
import { CheckInPatient } from '../../../application/use-cases/CheckInPatient';
import { GetQueueStatus } from '../../../application/use-cases/GetQueueStatus';
import { CallNextTurn } from '../../../application/use-cases/CallNextTurn';
import { SkipTurn } from '../../../application/use-cases/SkipTurn';
import { RecallCurrentTurn } from '../../../application/use-cases/RecallCurrentTurn';
import { CheckInSchema } from '../../../application/dtos/CheckInDto';
import { QueueDateSchema, todayUtc } from '../../../application/dtos/QueueDateDto';
import { asyncHandler } from '../asyncHandler';

export interface QueuesControllerDeps {
  checkInPatient: CheckInPatient;
  getQueueStatus: GetQueueStatus;
  callNextTurn: CallNextTurn;
  skipTurn: SkipTurn;
  recallCurrentTurn: RecallCurrentTurn;
}

export interface QueuesController {
  checkIn: RequestHandler;
  status: RequestHandler;
  next: RequestHandler;
  skip: RequestHandler;
  call: RequestHandler;
}

export function createQueuesController(deps: QueuesControllerDeps): QueuesController {
  const checkIn = asyncHandler(async (req, res) => {
    const doctorId = req.params['doctorId'] as string;
    const dto = CheckInSchema.parse(req.body);
    const turn = await deps.checkInPatient.execute(doctorId, todayUtc(), dto);
    res.status(201).json(turn.toJSON());
  });

  const status = asyncHandler(async (req, res) => {
    const doctorId = req.params['doctorId'] as string;
    const { date } = QueueDateSchema.parse(req.query);
    const patientId = req.user?.role === 'PATIENT' ? req.user.userId : undefined;
    const result = await deps.getQueueStatus.execute(doctorId, date ?? todayUtc(), patientId);
    res.status(200).json({
      current: result.current?.toJSON() ?? null,
      waiting: result.waiting.map((turn) => turn.toJSON()),
      myTurn: result.myTurn?.toJSON() ?? null,
    });
  });

  const next = asyncHandler(async (req, res) => {
    const doctorId = req.params['doctorId'] as string;
    const result = await deps.callNextTurn.execute(doctorId, todayUtc());
    res.status(200).json({
      finished: result.finished?.toJSON() ?? null,
      promoted: result.promoted?.toJSON() ?? null,
    });
  });

  const skip = asyncHandler(async (req, res) => {
    const doctorId = req.params['doctorId'] as string;
    const result = await deps.skipTurn.execute(doctorId, todayUtc());
    res.status(200).json({
      finished: result.finished?.toJSON() ?? null,
      promoted: result.promoted?.toJSON() ?? null,
    });
  });

  const call = asyncHandler(async (req, res) => {
    const doctorId = req.params['doctorId'] as string;
    const current = await deps.recallCurrentTurn.execute(doctorId, todayUtc());
    res.status(200).json(current.toJSON());
  });

  return { checkIn, status, next, skip, call };
}
