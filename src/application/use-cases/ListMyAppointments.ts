import { Appointment } from '../../domain/entities/Appointment';
import { AppointmentRepository } from '../../domain/ports/AppointmentRepository';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';
import { NotFoundError } from '../../domain/errors/NotFoundError';
import { UserRole } from '../../domain/entities/User';

export interface Requester {
  userId: string;
  role: UserRole;
}

/**
 * No listado en la seccion 4 (que solo nombra "ListAppointments.ts"), pero
 * necesario como caso de uso separado para GET /appointments/mine (seccion 6):
 * es una consulta de responsabilidad unica distinta del listado paginado de
 * ADMIN (ListAppointments.ts), no una variante con flags de la misma clase.
 *
 * Sirve tanto a PATIENT (sus propias citas, por patientId) como a DOCTOR (las
 * citas donde el es el doctor, por doctorId) -- este segundo caso se agrego
 * despues, porque el frontend necesitaba una forma de que un DOCTOR viera el
 * `appointmentId` de sus propias citas para poder pedir una cancelacion
 * (POST /appointments/:id/request-cancellation) sin tener que inventarse el id
 * a mano. Ver AI-CONTEXT.md.
 */
export class ListMyAppointments {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly doctors: DoctorRepository,
  ) {}

  async execute(requester: Requester): Promise<Appointment[]> {
    if (requester.role === 'DOCTOR') {
      const doctor = await this.doctors.findByUserId(requester.userId);
      if (!doctor) throw new NotFoundError('Perfil de doctor no encontrado');
      return this.appointments.findByDoctor(doctor.id);
    }
    return this.appointments.findByPatient(requester.userId);
  }
}
