/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('turns', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    doctor_id: { type: 'uuid', notNull: true, references: 'doctors', onDelete: 'NO ACTION' },
    appointment_id: { type: 'uuid', references: 'appointments', onDelete: 'NO ACTION' },
    queue_date: { type: 'date', notNull: true },
    number: { type: 'integer', notNull: true },
    patient_name: { type: 'varchar(255)', notNull: true },
    priority: { type: 'varchar(20)', notNull: true, default: 'normal' },
    status: { type: 'varchar(20)', notNull: true, default: 'waiting' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('turns', 'turns_priority_check', {
    check: "priority IN ('normal', 'preferente')",
  });

  pgm.addConstraint('turns', 'turns_status_check', {
    check: "status IN ('waiting', 'in-progress', 'done', 'skipped')",
  });

  pgm.createIndex('turns', ['doctor_id', 'queue_date', 'number'], {
    name: 'idx_turns_doctor_date_number',
    unique: true,
  });

  // Nucleo critico de la cola: nunca dos turnos in-progress del mismo doctor al
  // mismo tiempo, garantizado a nivel de base de datos igual que el EXCLUDE de
  // appointments (indice unico parcial).
  pgm.createIndex('turns', ['doctor_id', 'queue_date'], {
    name: 'idx_turns_one_in_progress',
    unique: true,
    where: "status = 'in-progress'",
  });

  pgm.createIndex('turns', ['doctor_id', 'queue_date', 'status'], {
    name: 'idx_turns_doctor_date_status',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('turns');
};
