import { UpdateDoctorPhoto } from '../../../src/application/use-cases/UpdateDoctorPhoto';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeDoctorRepo, makeUserRepo } from './mocks';

function buildDoctor(photoUrl: string | null): Doctor {
  return Doctor.create({
    id: 'doc-1',
    userId: 'user-doc-1',
    name: 'Dr. Test',
    specialty: 'Cardiologia',
    isActive: true,
    createdAt: new Date(),
    photoUrl,
  });
}

describe('UpdateDoctorPhoto', () => {
  it('actualiza la foto en users y en doctors, y retorna el doctor con la anterior', async () => {
    const doctors = makeDoctorRepo();
    doctors.findById
      .mockResolvedValueOnce(buildDoctor('/uploads/photos/old.jpg'))
      .mockResolvedValueOnce(buildDoctor('/uploads/photos/new.jpg'));
    const users = makeUserRepo();

    const useCase = new UpdateDoctorPhoto(doctors, users);
    const result = await useCase.execute('doc-1', '/uploads/photos/new.jpg');

    expect(users.updatePhotoUrl).toHaveBeenCalledWith('user-doc-1', '/uploads/photos/new.jpg');
    expect(doctors.updatePhoto).toHaveBeenCalledWith('doc-1', '/uploads/photos/new.jpg');
    expect(result.previousPhotoUrl).toBe('/uploads/photos/old.jpg');
    expect(result.doctor.photoUrl).toBe('/uploads/photos/new.jpg');
  });

  it('lanza NotFoundError si el doctor no existe', async () => {
    const doctors = makeDoctorRepo();
    doctors.findById.mockResolvedValue(null);
    const users = makeUserRepo();

    const useCase = new UpdateDoctorPhoto(doctors, users);
    await expect(useCase.execute('no-existe', '/uploads/photos/x.jpg')).rejects.toThrow(NotFoundError);
    expect(users.updatePhotoUrl).not.toHaveBeenCalled();
  });
});
