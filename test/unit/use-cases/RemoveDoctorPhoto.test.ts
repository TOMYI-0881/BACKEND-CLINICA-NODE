import { RemoveDoctorPhoto } from '../../../src/application/use-cases/RemoveDoctorPhoto';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeDoctorRepo, makeUserRepo } from './mocks';

function buildDoctor(photoUrl: string | null): Doctor {
  return Doctor.create({
    id: 'doc-1',
    userId: 'user-doc-1',
    name: 'Dr. Test',
    specialty: 'Cardiologia',
    gender: 'male',
    isActive: true,
    createdAt: new Date(),
    photoUrl,
  });
}

describe('RemoveDoctorPhoto', () => {
  it('quita la foto en users y en doctors, y retorna el doctor con la anterior', async () => {
    const doctors = makeDoctorRepo();
    doctors.findById
      .mockResolvedValueOnce(buildDoctor('/uploads/photos/old.jpg'))
      .mockResolvedValueOnce(buildDoctor(null));
    const users = makeUserRepo();

    const useCase = new RemoveDoctorPhoto(doctors, users);
    const result = await useCase.execute('doc-1');

    expect(users.updatePhotoUrl).toHaveBeenCalledWith('user-doc-1', null);
    expect(doctors.updatePhoto).toHaveBeenCalledWith('doc-1', null);
    expect(result.previousPhotoUrl).toBe('/uploads/photos/old.jpg');
    expect(result.doctor.photoUrl).toBeNull();
  });

  it('lanza NotFoundError si el doctor no existe', async () => {
    const doctors = makeDoctorRepo();
    doctors.findById.mockResolvedValue(null);
    const users = makeUserRepo();

    const useCase = new RemoveDoctorPhoto(doctors, users);
    await expect(useCase.execute('no-existe')).rejects.toThrow(NotFoundError);
    expect(users.updatePhotoUrl).not.toHaveBeenCalled();
  });
});
