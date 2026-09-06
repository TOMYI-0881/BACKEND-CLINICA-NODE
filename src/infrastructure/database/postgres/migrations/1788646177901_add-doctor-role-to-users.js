/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Agrega el rol DOCTOR: desde ahora los doctores son usuarios del sistema con login propio,
 * no solo un directorio sin cuenta (ver AI-CONTEXT.md, seccion "Rol DOCTOR").
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.dropConstraint('users', 'users_role_check');
  pgm.addConstraint('users', 'users_role_check', {
    check: "role IN ('PATIENT', 'ADMIN', 'DOCTOR')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropConstraint('users', 'users_role_check');
  pgm.addConstraint('users', 'users_role_check', {
    check: "role IN ('PATIENT', 'ADMIN')",
  });
};
