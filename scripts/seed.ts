import { Pool } from 'pg';
import { env } from '../src/config/env';
import { PostgresDoctorRepository } from '../src/infrastructure/database/postgres/PostgresDoctorRepository';
import { BcryptAdapter } from '../src/infrastructure/auth/BcryptAdapter';

// Desde el rol DOCTOR (ver AI-CONTEXT.md), todo doctor es tambien una cuenta de usuario.
// Password de seed unica y conocida para poder probar el login del doctor sin buscarla.
const SEED_DOCTOR_PASSWORD = 'clinica123';

const DOCTORS = [
  { name: 'Dra. Ana Fernandez', specialty: 'Cardiologia', email: 'ana.fernandez@clinica.test' },
  { name: 'Dr. Bruno Gimenez', specialty: 'Pediatria', email: 'bruno.gimenez@clinica.test' },
  { name: 'Dra. Carla Lopez', specialty: 'Dermatologia', email: 'carla.lopez@clinica.test' },
  { name: 'Dr. Diego Martinez', specialty: 'Traumatologia', email: 'diego.martinez@clinica.test' },
  { name: 'Dra. Elena Suarez', specialty: 'Clinica Medica', email: 'elena.suarez@clinica.test' },
];

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: env.databaseUrl });
  const doctorRepo = new PostgresDoctorRepository(pool);
  const hasher = new BcryptAdapter();

  try {
    for (const doctor of DOCTORS) {
      const existing = await pool.query('SELECT id FROM doctors WHERE name = $1', [doctor.name]);
      if (existing.rowCount && existing.rowCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`Doctor ya existe, se omite: ${doctor.name}`);
        continue;
      }
      const passwordHash = await hasher.hash(SEED_DOCTOR_PASSWORD);
      await doctorRepo.createDoctorAccount({
        name: doctor.name,
        specialty: doctor.specialty,
        email: doctor.email,
        passwordHash,
      });
      // eslint-disable-next-line no-console
      console.log(
        `Doctor creado: ${doctor.name} (${doctor.specialty}) -- login: ${doctor.email} / ${SEED_DOCTOR_PASSWORD}`,
      );
    }
  } finally {
    await pool.end();
  }
}

seed()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Seed completado.');
    process.exit(0);
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Seed fallo:', err);
    process.exit(1);
  });
