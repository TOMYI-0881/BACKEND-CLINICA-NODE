import { CancellationRequest } from '../../domain/entities/CancellationRequest';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { AppointmentCancellationRequestRepository } from '../../domain/ports/AppointmentCancellationRequestRepository';
import { ForbiddenError } from '../../domain/errors/ForbiddenError';
import { NotFoundError } from '../../domain/errors/NotFoundError';
import { RequestCancellationDto } from '../dtos/RequestCancellationDto';

/** Un DOCTOR pide cancelar una cita propia, con motivo. Requiere aprobacion de ADMIN. */
export class RequestAppointmentCancellation {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly doctors: DoctorRepository,
    private readonly cancellationRequests: AppointmentCancellationRequestRepository,
  ) {}

  async execute(
    doctorUserId: string,
    appointmentId: string,
    dto: RequestCancellationDto,
  ): Promise<CancellationRequest> {
    const doctor = await this.doctors.findByUserId(doctorUserId);
    if (!doctor) throw new NotFoundError('Perfil de doctor no encontrado');

    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment) throw new NotFoundError('Reserva no encontrada');

    if (!appointment.belongsToDoctor(doctor.id)) {
      throw new ForbiddenError('No podes pedir la cancelacion de una cita de otro doctor');
    }

    return this.cancellationRequests.create({
      appointmentId,
      requestedBy: doctorUserId,
      reason: dto.reason,
    });
  }
}
