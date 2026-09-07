/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Relaja "una cita activa por paciente+medico en cualquier fecha"
 * (idx_one_active_appointment_per_patient_doctor, add-patient-overlap-and-one-per-doctor.js) a
 * "una cita por paciente+medico+dia calendario", mismo criterio de dia (UTC) que
 * findBlockingByDoctorAndDate y dateKey() en CreateAppointment.ts. Se usa
 * (start_time AT TIME ZONE 'UTC')::date en vez de start_time::date a secas porque Postgres
 * exige que las expresiones de un indice sean IMMUTABLE, y un ::date sobre timestamptz depende
 * del timezone de la sesion (no lo es); fijando 'UTC' explicitamente la expresion es
 * determinista y ademas coincide exactamente con dateKey() (toISOString().slice(0,10), UTC).
 * Efectos:
 * - CONFIRMED con el mismo medico en dias distintos ahora se permite (antes bloqueado siempre).
 * - COMPLETED entra al predicado: una cita ya atendida sigue bloqueando una nueva reserva ESE
 *   MISMO dia, pero libera el dia siguiente en adelante.
 * - CANCELLED sigue afuera del predicado: cancelar y reservar otro horario el mismo dia (antes
 *   de ser atendido) no se rompe.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.dropIndex('appointments', ['patient_id', 'doctor_id'], {
    name: 'idx_one_active_appointment_per_patient_doctor',
  });

  pgm.createIndex('appointments', ['patient_id', 'doctor_id', "((start_time AT TIME ZONE 'UTC')::date)"], {
    name: 'idx_one_appointment_per_patient_doctor_day',
    unique: true,
    where: "status IN ('CONFIRMED', 'CANCELLATION_REQUESTED', 'COMPLETED')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropIndex('appointments', ['patient_id', 'doctor_id', "((start_time AT TIME ZONE 'UTC')::date)"], {
    name: 'idx_one_appointment_per_patient_doctor_day',
  });

  pgm.createIndex('appointments', ['patient_id', 'doctor_id'], {
    name: 'idx_one_active_appointment_per_patient_doctor',
    unique: true,
    where: "status IN ('CONFIRMED', 'CANCELLATION_REQUESTED')",
  });
};
