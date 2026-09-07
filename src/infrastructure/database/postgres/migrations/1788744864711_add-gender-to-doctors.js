/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Agrega genero al doctor (el prefijo "Dr./Dra." deja de guardarse en doctors.name; el
 * frontend lo antepone segun genero a nivel presentacion) y sincroniza users.name con
 * doctors.name (hoy queda '' para doctores porque createDoctorAccount nunca escribia name
 * en el INSERT de users -- ver PostgresDoctorRepository.ts).
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('doctors', {
    gender: { type: 'text', notNull: true, default: 'male' },
  });

  // Backfill: derivar gender desde el prefijo existente
  pgm.sql("UPDATE doctors SET gender = 'male' WHERE name ILIKE 'Dr. %'");
  pgm.sql("UPDATE doctors SET gender = 'female' WHERE name ILIKE 'Dra. %'");
  // Fallback solo para filas sin prefijo: primer nombre terminado en 'a' -> female
  pgm.sql(
    "UPDATE doctors SET gender = 'female' WHERE gender = 'male' AND lower(split_part(name, ' ', 1)) LIKE '%a'",
  );

  // Quitar el prefijo del nombre (queda el nombre real). "Dr. " = 5 chars, "Dra. " = 6
  pgm.sql("UPDATE doctors SET name = trim(substr(name, 5)) WHERE name ILIKE 'Dr. %'");
  pgm.sql("UPDATE doctors SET name = trim(substr(name, 6)) WHERE name ILIKE 'Dra. %'");

  // Sync users.name desde el perfil de doctor
  pgm.sql("UPDATE users u SET name = d.name FROM doctors d WHERE d.user_id = u.id AND u.role = 'DOCTOR'");

  pgm.addConstraint('doctors', 'doctors_gender_check', { check: "gender IN ('male','female')" });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropConstraint('doctors', 'doctors_gender_check');
  pgm.dropColumn('doctors', 'gender');
};
