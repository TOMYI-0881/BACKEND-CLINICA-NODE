/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Regla de negocio agregada en la Fase 6 (ver seccion 9.7 del prompt maestro):
 * una cita solo puede generar UN turno de cola. Sin esto, un doble check-in
 * (doble click, reintento de red) crearia dos turnos para la misma cita.
 * Mismo patron que no_overlapping_appointments e idx_turns_one_in_progress:
 * la base de datos es la fuente de verdad, no una validacion en el caso de uso.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createIndex('turns', 'appointment_id', {
    name: 'idx_turns_one_per_appointment',
    unique: true,
    where: 'appointment_id IS NOT NULL',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropIndex('turns', 'appointment_id', { name: 'idx_turns_one_per_appointment' });
};
