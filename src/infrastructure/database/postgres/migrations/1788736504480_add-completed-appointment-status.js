/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Estado terminal 'COMPLETED' para citas ya atendidas. Sin esto, una cita pasada queda
 * CONFIRMED para siempre y sigue ocupando idx_one_active_appointment_per_patient_doctor
 * (add-patient-overlap-and-one-per-doctor.js), bloqueando al paciente de reservar una
 * nueva cita futura con el mismo medico. Los EXCLUDE/indice unico ya filtran por
 * status IN ('CONFIRMED', 'CANCELLATION_REQUESTED'), asi que COMPLETED queda afuera de
 * esas garantias sin tocarlas.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.dropConstraint('appointments', 'appointments_status_check');
  pgm.addConstraint('appointments', 'appointments_status_check', {
    check: "status IN ('CONFIRMED', 'CANCELLED', 'CANCELLATION_REQUESTED', 'COMPLETED')",
  });

  // Backfill: las citas activas cuyo horario ya paso se consideran atendidas.
  pgm.sql(`
    UPDATE appointments
    SET status = 'COMPLETED'
    WHERE status IN ('CONFIRMED', 'CANCELLATION_REQUESTED')
      AND start_time < now();
  `);
};

/**
 * Irreversible para los datos: las filas que el backfill paso a COMPLETED no vuelven a su
 * estado anterior (no se guarda de donde vinieron). Solo se revierte el CHECK constraint.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropConstraint('appointments', 'appointments_status_check');
  pgm.addConstraint('appointments', 'appointments_status_check', {
    check: "status IN ('CONFIRMED', 'CANCELLED', 'CANCELLATION_REQUESTED')",
  });
};
