/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('appointments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    doctor_id: { type: 'uuid', notNull: true, references: 'doctors', onDelete: 'NO ACTION' },
    patient_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'NO ACTION' },
    start_time: { type: 'timestamptz', notNull: true },
    end_time: { type: 'timestamptz', notNull: true },
    status: { type: 'varchar(20)', notNull: true, default: 'CONFIRMED' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('appointments', 'appointments_status_check', {
    check: "status IN ('CONFIRMED', 'CANCELLED')",
  });

  pgm.addConstraint('appointments', 'appointments_end_after_start_check', {
    check: 'end_time > start_time',
  });

  // Nucleo critico: nunca permitir dos citas CONFIRMED del mismo doctor con horarios
  // que se superpongan. tstzrange usa por defecto bounds '[)', por lo que citas
  // consecutivas (ej. 10:00-11:00 y 11:00-12:00) son validas y no chocan.
  //
  // Nota de correccion (instruccion 11 del prompt maestro): la seccion 5 usa
  // `tsrange(start_time, end_time)`, pero esas columnas son TIMESTAMPTZ y `tsrange`
  // solo acepta `timestamp` (sin zona horaria) -- Postgres rechaza la migracion con
  // "function tsrange(timestamp with time zone, timestamp with time zone) does not
  // exist" (42883). La funcion correcta para TIMESTAMPTZ es `tstzrange`, con
  // identica semantica de bounds '[)'.
  pgm.addConstraint('appointments', 'no_overlapping_appointments', {
    exclude:
      "USING gist (doctor_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status = 'CONFIRMED')",
  });

  pgm.createIndex('appointments', 'patient_id', { name: 'idx_appointments_patient' });
  pgm.createIndex('appointments', ['doctor_id', 'start_time'], { name: 'idx_appointments_doctor_date' });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('appointments');
};
