import { Doctor, DoctorGender } from '../entities/Doctor';

export interface NewDoctorAccountData {
  name: string;
  specialty: string;
  email: string;
  passwordHash: string;
  gender: DoctorGender;
}

export interface UpdateDoctorData {
  name?: string;
  specialty?: string;
  gender?: DoctorGender;
}

/**
 * Puerto de persistencia de doctores.
 *
 * Nota de desviacion documentada (instruccion 11 del prompt maestro): la seccion 4
 * enumera 6 puertos y no incluye este. Sin embargo, sin un DoctorRepository los
 * casos de uso de doctores (POST/GET /doctors) tendrian que importar `pg`
 * directamente o vivir dentro de AppointmentRepository, violando Clean
 * Architecture (seccion 3: el dominio nunca importa tecnologia externa). Se anade
 * como septimo puerto, mismo patron que los demas.
 *
 * Desde el rol DOCTOR (ver AI-CONTEXT.md), todo doctor es tambien una cuenta de usuario:
 * `createDoctorAccount` crea ambas filas (users + doctors) en una unica transaccion, para
 * nunca dejar un usuario huerfano sin perfil de doctor si algo falla a mitad de camino.
 */
export interface DoctorRepository {
  /** @throws ConflictError si el email ya esta registrado. */
  createDoctorAccount(data: NewDoctorAccountData): Promise<Doctor>;
  /** Solo doctores activos. */
  findAll(): Promise<Doctor[]>;
  findById(id: string): Promise<Doctor | null>;
  findByUserId(userId: string): Promise<Doctor | null>;
  /** @throws NotFoundError si no existe. */
  update(id: string, data: UpdateDoctorData): Promise<Doctor>;
  /** Soft-delete: nunca DELETE real (appointments/turns referencian doctors con ON DELETE NO ACTION). */
  deactivate(id: string): Promise<Doctor>;
  /** Copia denormalizada de la foto de perfil del usuario, para que el listado publico no necesite JOIN. */
  updatePhoto(id: string, photoUrl: string | null): Promise<Doctor>;
}
