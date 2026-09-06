import { ListMyAppointments } from '../../../src/application/use-cases/ListMyAppointments';
import { Appointment } from '../../../src/domain/entities/Appointment';
import { Doctor } from '../../../src/domain/entities/Doctor';
import { NotFoundError } from '../../../src/domain/errors/NotFoundError';
import { makeAppointmentRepo, makeDoctorRepo } from './mocks';

function buildAppointment(doctorId: string, patientId: string): Appointment {
  return Appointment.create({
    id: 'apt-1',
    doctorId,
    patientId,
    startTime: new Date('2027-01-01T10:00:00Z'),
    endTime: new Date('2027-01-01T11:00:00Z'),
    status: 'CONFIRMED',
    createdAt: new Date(),
  });
}

function buildDoctor(id: string, userId: string): Doctor {
  return Doctor.create({ id, userId, name: 'Dr. Test', specialty: 'Test', isActive: true, createdAt: new Date() });
}

describe('ListMyAppointments', () => {
  it('un PATIENT recibe sus propias citas por patientId', async () => {
    const appointments = makeAppointmentRepo();
    const appointment = buildAppointment('doc-1', 'pat-1');
    appointments.findByPatient.mockResolvedValue([appointment]);
    const doctors = makeDoctorRepo();

    const useCase = new ListMyAppointments(appointments, doctors);
    const result = await useCase.execute({ userId: 'pat-1', role: 'PATIENT' });

    expect(appointments.findByPatient).toHaveBeenCalledWith('pat-1');
    expect(appointments.findByDoctor).not.toHaveBeenCalled();
    expect(result).toEqual([appointment]);
  });

  it('un DOCTOR recibe las citas de su propio perfil por doctorId (no por su userId)', async () => {
    const appointments = makeAppointmentRepo();
    const appointment = buildAppointment('doc-1', 'pat-1');
    appointments.findByDoctor.mockResolvedValue([appointment]);
    const doctors = makeDoctorRepo();
    doctors.findByUserId.mockResolvedValue(buildDoctor('doc-1', 'user-doc-1'));

    const useCase = new ListMyAppointments(appointments, doctors);
    const result = await useCase.execute({ userId: 'user-doc-1', role: 'DOCTOR' });

    expect(doctors.findByUserId).toHaveBeenCalledWith('user-doc-1');
    expect(appointments.findByDoctor).toHaveBeenCalledWith('doc-1');
    expect(appointments.findByPatient).not.toHaveBeenCalled();
    expect(result).toEqual([appointment]);
  });

  it('lanza NotFoundError si el DOCTOR no tiene perfil vinculado', async () => {
    const appointments = makeAppointmentRepo();
    const doctors = makeDoctorRepo();
    doctors.findByUserId.mockResolvedValue(null);

    const useCase = new ListMyAppointments(appointments, doctors);
    await expect(useCase.execute({ userId: 'user-sin-perfil', role: 'DOCTOR' })).rejects.toThrow(NotFoundError);
  });
});
