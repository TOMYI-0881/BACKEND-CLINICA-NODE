import { Turn } from '../../domain/entities/Turn';
import { QueueRepository, QueueStatus } from '../../domain/ports/QueueRepository';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';

export interface QueueStatusWithMyTurn extends QueueStatus {
  myTurn: Turn | null;
}

export class GetQueueStatus {
  constructor(
    private readonly queues: QueueRepository,
    private readonly appointments: AppointmentRepository,
  ) {}

  async execute(doctorId: string, queueDate: string, patientId?: string): Promise<QueueStatusWithMyTurn> {
    const status = await this.queues.getStatus(doctorId, queueDate);

    let myTurn: Turn | null = null;
    if (patientId) {
      const myAppointments = await this.appointments.findByPatient(patientId);
      const todaysAppointment = myAppointments.find(
        (appointment) =>
          appointment.doctorId === doctorId &&
          appointment.isConfirmed() &&
          appointment.startTime.toISOString().slice(0, 10) === queueDate,
      );
      if (todaysAppointment) {
        myTurn =
          [status.current, ...status.waiting].find((turn) => turn?.appointmentId === todaysAppointment.id) ?? null;
      }
    }

    return { ...status, myTurn };
  }
}
