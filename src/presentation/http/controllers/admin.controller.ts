import { RequestHandler } from 'express';
import { GetDashboardStats } from '../../../application/use-cases/GetDashboardStats';
import { asyncHandler } from '../asyncHandler';

export interface AdminControllerDeps {
  getDashboardStats: GetDashboardStats;
}

export interface AdminController {
  dashboardStats: RequestHandler;
}

export function createAdminController(deps: AdminControllerDeps): AdminController {
  return {
    dashboardStats: asyncHandler(async (_req, res) => {
      res.status(200).json(await deps.getDashboardStats.execute());
    }),
  };
}
