import { CancellationRequest } from '../../domain/entities/CancellationRequest';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { AppointmentCancellationRequestRepository } from '../../domain/ports/AppointmentCancellationRequestRepository';
import { EventPublisher } from '../../domain/ports/EventPublisher';
import { QueueRepository } from '../../domain/ports/QueueRepository';
import { ForbiddenError } from '../../domain/errors/ForbiddenError';
import { NotFoundError } from '../../domain/errors/NotFoundError';
import { RequestCancellationDto } from '../dtos/RequestCancellationDto';
import { broadcastQueueStatus } from './broadcastQueueStatus';
import { logError } from '../logError';

/** Un DOCTOR pide cancelar una cita propia, con motivo. Requiere aprobacion de ADMIN. */
export class RequestAppointmentCancellation {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly doctors: DoctorRepository,
    private readonly cancellationRequests: AppointmentCancellationRequestRepository,
    private readonly events: EventPublisher,
    private readonly queues: QueueRepository,
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

    const request = await this.cancellationRequests.create({
      appointmentId,
      requestedBy: doctorUserId,
      reason: dto.reason,
    });

    // El turno de cola de esta cita se oculta de la espera en vivo mientras el pedido
    // esta pendiente (ver filtro en PostgresQueueRepository.getStatus).
    const date = appointment.startTime.toISOString().slice(0, 10);
    broadcastQueueStatus(this.events, this.queues, appointment.doctorId, date).catch(logError);

    return request;
  }
}
