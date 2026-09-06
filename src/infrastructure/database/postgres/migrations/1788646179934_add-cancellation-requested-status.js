/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Agrega el estado intermedio CANCELLATION_REQUESTED (un DOCTOR pide cancelar, ADMIN aprueba
 * o rechaza). Corregimos ademas el WHERE del EXCLUDE de no-solapamiento: si solo protegiera
 * CONFIRMED, el horario quedaria libre para que otro paciente lo reserve mientras la
 * cancelacion todavia esta pendiente de revision -- y si el admin la rechaza despues,
 * quedarian dos personas con el mismo turno. Ver AI-CONTEXT.md.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.dropConstraint('appointments', 'appointments_status_check');
  pgm.addConstraint('appointments', 'appointments_status_check', {
    check: "status IN ('CONFIRMED', 'CANCELLED', 'CANCELLATION_REQUESTED')",
  });

  pgm.dropConstraint('appointments', 'no_overlapping_appointments');
  pgm.addConstraint('appointments', 'no_overlapping_appointments', {
    exclude:
      "USING gist (doctor_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status IN ('CONFIRMED', 'CANCELLATION_REQUESTED'))",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropConstraint('appointments', 'no_overlapping_appointments');
  pgm.addConstraint('appointments', 'no_overlapping_appointments', {
    exclude: "USING gist (doctor_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status = 'CONFIRMED')",
  });

  pgm.dropConstraint('appointments', 'appointments_status_check');
  pgm.addConstraint('appointments', 'appointments_status_check', {
    check: "status IN ('CONFIRMED', 'CANCELLED')",
  });
};
