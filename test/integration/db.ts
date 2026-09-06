import { Pool } from 'pg';
import { env } from '../../src/config/env';
import { Doctor } from '../../src/domain/entities/Doctor';
import { DoctorRepository } from '../../src/domain/ports/DoctorRepository';

export function createTestPool(): Pool {
  return new Pool({ connectionString: env.databaseUrl, max: 25 });
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE appointment_cancellation_requests, turns, appointments, doctors, users RESTART IDENTITY CASCADE',
  );
}

let doctorEmailCounter = 0;

/**
 * Desde el rol DOCTOR, todo doctor es tambien una cuenta de usuario -- este helper evita
 * repetir el email/passwordHash de relleno en cada test de integracion que solo necesita
 * un doctor existente, sin loguearse como el.
 */
export async function createTestDoctor(
  doctorRepo: DoctorRepository,
  data: { name: string; specialty: string },
): Promise<Doctor> {
  doctorEmailCounter += 1;
  return doctorRepo.createDoctorAccount({
    ...data,
    email: `doctor-${Date.now()}-${doctorEmailCounter}@test.com`,
    passwordHash: 'test-hash',
  });
}
