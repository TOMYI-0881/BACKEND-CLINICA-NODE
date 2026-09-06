/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Nombre ingresado al registrarse, para mostrar en el turno auto-encolado
 * (CreateAppointment.enrollInQueue) en vez del prefijo del email. NOT NULL con
 * default '' para no romper filas existentes: doctores y el admin no se crean via
 * UserRepository.save (createDoctorAccount / insert manual), asi que quedan con
 * name = '' -- el encolado cae al fallback del email en ese caso.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('users', {
    name: { type: 'varchar(120)', notNull: true, default: '' },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('users', ['name']);
};
