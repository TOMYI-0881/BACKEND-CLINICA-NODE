/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Copia denormalizada de users.photo_url para el doctor asociado, para que el
 * listado publico GET /doctors muestre la foto sin necesitar un JOIN contra users.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('doctors', {
    photo_url: { type: 'varchar(500)', notNull: false },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('doctors', ['photo_url']);
};
