import { GetDashboardStats } from '../../../src/application/use-cases/GetDashboardStats';
import { DashboardStats } from '../../../src/domain/ports/AppointmentRepository';
import { makeAppointmentRepo } from './mocks';

function buildStats(): DashboardStats {
  return {
    citasPorEstado: { CONFIRMED: 3, CANCELLED: 1, CANCELLATION_REQUESTED: 0, COMPLETED: 5 },
    citasHoy: 2,
    proximasCitas: 3,
    totalCitas: 9,
    totalPacientes: 4,
    totalDoctoresActivos: 5,
    totalDoctoresInactivos: 1,
    cancelacionesPendientes: 0,
  };
}

describe('GetDashboardStats', () => {
  it('retorna las estadisticas del repositorio tal cual', async () => {
    const appointments = makeAppointmentRepo();
    const stats = buildStats();
    appointments.getDashboardStats.mockResolvedValue(stats);

    const useCase = new GetDashboardStats(appointments);
    const result = await useCase.execute();

    expect(appointments.getDashboardStats).toHaveBeenCalled();
    expect(result).toBe(stats);
  });
});
