import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { env } from '../src/config/env';
import { PostgresDoctorRepository } from '../src/infrastructure/database/postgres/PostgresDoctorRepository';
import { BcryptAdapter } from '../src/infrastructure/auth/BcryptAdapter';

// Desde el rol DOCTOR (ver AI-CONTEXT.md), todo doctor es tambien una cuenta de usuario.
// Password de seed unica y conocida para poder probar el login del doctor sin buscarla.
const SEED_DOCTOR_PASSWORD = 'clinica123';

// Fotos iniciales en public/image/, nombradas por doctor. Se copian a uploads/photos/ (la
// misma carpeta que sirve el upload manual, ver upload.middleware.ts) para que photo_url
// quede resoluble por el mismo /uploads estatico sin importar quien la haya puesto ahi.
const PHOTOS_SOURCE_DIR = path.resolve(__dirname, '../public/image');
const PHOTOS_DEST_DIR = path.resolve(process.cwd(), env.uploadDir, 'photos');

const DOCTORS = [
  {
    name: 'Dra. Ana Fernandez',
    specialty: 'Cardiologia',
    email: 'ana.fernandez@clinica.test',
    photoFile: 'doctor-ana.jpg',
  },
  {
    name: 'Dr. Bruno Gimenez',
    specialty: 'Pediatria',
    email: 'bruno.gimenez@clinica.test',
    photoFile: 'doctor-bruno.jpg',
  },
  {
    name: 'Dra. Carla Lopez',
    specialty: 'Dermatologia',
    email: 'carla.lopez@clinica.test',
    photoFile: 'doctor-carla.jpg',
  },
  {
    name: 'Dr. Diego Martinez',
    specialty: 'Traumatologia',
    email: 'diego.martinez@clinica.test',
    photoFile: 'doctor-diego.jpg',
  },
  {
    name: 'Dra. Elena Suarez',
    specialty: 'Clinica Medica',
    email: 'elena.suarez@clinica.test',
    photoFile: 'doctor-elena.jpg',
  },
];

/** Copia la foto a uploads/photos/ (si todavia no esta) y devuelve la photo_url servible. */
function ensurePhotoCopied(photoFile: string): string {
  fs.mkdirSync(PHOTOS_DEST_DIR, { recursive: true });
  const dest = path.join(PHOTOS_DEST_DIR, photoFile);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(PHOTOS_SOURCE_DIR, photoFile), dest);
  }
  return `/uploads/photos/${photoFile}`;
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: env.databaseUrl });
  const doctorRepo = new PostgresDoctorRepository(pool);
  const hasher = new BcryptAdapter();

  try {
    for (const doctor of DOCTORS) {
      const photoUrl = ensurePhotoCopied(doctor.photoFile);
      const existing = await pool.query<{ id: string; user_id: string; photo_url: string | null }>(
        'SELECT id, user_id, photo_url FROM doctors WHERE name = $1',
        [doctor.name],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        const row = existing.rows[0]!;
        if (!row.photo_url) {
          await doctorRepo.updatePhoto(row.id, photoUrl);
          await pool.query('UPDATE users SET photo_url = $2 WHERE id = $1', [row.user_id, photoUrl]);
          // eslint-disable-next-line no-console
          console.log(`Doctor ya existia, se le agrego foto inicial: ${doctor.name}`);
        } else {
          // eslint-disable-next-line no-console
          console.log(`Doctor ya existe, se omite: ${doctor.name}`);
        }
        continue;
      }
      const passwordHash = await hasher.hash(SEED_DOCTOR_PASSWORD);
      const created = await doctorRepo.createDoctorAccount({
        name: doctor.name,
        specialty: doctor.specialty,
        email: doctor.email,
        passwordHash,
      });
      await doctorRepo.updatePhoto(created.id, photoUrl);
      await pool.query('UPDATE users SET photo_url = $2 WHERE id = $1', [created.userId, photoUrl]);
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
