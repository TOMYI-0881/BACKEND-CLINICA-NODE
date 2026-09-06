import { UpdateDoctor } from '../../../src/application/use-cases/UpdateDoctor';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { makeDoctorRepo } from './mocks';

describe('UpdateDoctor', () => {
  it('delega en el repositorio y retorna el doctor actualizado', async () => {
    const doctors = makeDoctorRepo();
    const updated = Doctor.create({
      id: 'doc-1',
      userId: 'user-1',
      name: 'Nuevo Nombre',
      specialty: 'Cardiologia',
      isActive: true,
      createdAt: new Date(),
      photoUrl: null,
    });
    doctors.update.mockResolvedValue(updated);

    const useCase = new UpdateDoctor(doctors);
    const result = await useCase.execute('doc-1', { name: 'Nuevo Nombre' });

    expect(doctors.update).toHaveBeenCalledWith('doc-1', { name: 'Nuevo Nombre' });
    expect(result).toBe(updated);
  });
});
