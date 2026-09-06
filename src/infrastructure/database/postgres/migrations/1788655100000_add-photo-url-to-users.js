/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Foto de perfil opcional, unica por usuario (subir una nueva reemplaza la anterior,
 * nunca se acumulan varias). Cubre pacientes, doctores y admins por igual.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('users', {
    photo_url: { type: 'varchar(500)', notNull: false },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('users', ['photo_url']);
};
