/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Bug real detectado en integracion: 'appointments.status' es varchar(20), pero
 * 'CANCELLATION_REQUESTED' tiene 23 caracteres. La migracion anterior
 * (add-cancellation-requested-status) amplio el CHECK constraint sin ampliar el
 * tipo de columna -- Postgres no valida longitud en un CHECK, asi que el error
 * solo aparecio al intentar el UPDATE real ("value too long for type character
 * varying(20)"). Se amplia a varchar(30), con margen para el futuro.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.alterColumn('appointments', 'status', { type: 'varchar(30)' });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.alterColumn('appointments', 'status', { type: 'varchar(20)' });
};
