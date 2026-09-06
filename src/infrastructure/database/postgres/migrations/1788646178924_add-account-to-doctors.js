/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Todo doctor se crea de ahora en mas junto con su cuenta de usuario (rol DOCTOR).
 * user_id es NOT NULL: rompe los doctores sembrados sin cuenta de versiones anteriores,
 * por eso scripts/seed.ts se reescribe en el mismo cambio.
 * is_active soporta el "borrado" de un doctor como soft-delete (nunca DELETE real: las
 * FK de appointments/turns hacia doctors son ON DELETE NO ACTION).
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('doctors', {
    user_id: { type: 'uuid', notNull: true, references: 'users', unique: true },
    is_active: { type: 'boolean', notNull: true, default: true },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('doctors', ['user_id', 'is_active']);
};
