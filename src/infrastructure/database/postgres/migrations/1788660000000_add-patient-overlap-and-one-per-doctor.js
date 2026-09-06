/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Dos garantias nuevas sobre appointments, ambas a nivel de constraint (mismo patron que
 * no_overlapping_appointments: la BD es la fuente de verdad atomica bajo concurrencia, no se
 * reimplementa en codigo):
 * - no_overlapping_patient_appointments: un paciente no puede tener dos citas activas
 *   (CONFIRMED o CANCELLATION_REQUESTED) con horarios solapados, sin importar el doctor --
 *   no puede estar en dos consultorios a la vez.
 * - idx_one_active_appointment_per_patient_doctor: un paciente no puede tener mas de una cita
 *   activa con el mismo doctor, en cualquier fecha (evita acumulacion de turnos con el mismo
 *   especialista).
 * btree_gist ya esta habilitado (create-extensions.js).
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addConstraint('appointments', 'no_overlapping_patient_appointments', {
    exclude:
      "USING gist (patient_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status IN ('CONFIRMED', 'CANCELLATION_REQUESTED'))",
  });

  pgm.createIndex('appointments', ['patient_id', 'doctor_id'], {
    name: 'idx_one_active_appointment_per_patient_doctor',
    unique: true,
    where: "status IN ('CONFIRMED', 'CANCELLATION_REQUESTED')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropIndex('appointments', ['patient_id', 'doctor_id'], {
    name: 'idx_one_active_appointment_per_patient_doctor',
  });
  pgm.dropConstraint('appointments', 'no_overlapping_patient_appointments');
};
