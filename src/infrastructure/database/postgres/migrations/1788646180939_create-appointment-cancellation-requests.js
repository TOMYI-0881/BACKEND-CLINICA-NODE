/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('appointment_cancellation_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    appointment_id: { type: 'uuid', notNull: true, references: 'appointments', onDelete: 'NO ACTION' },
    requested_by: { type: 'uuid', notNull: true, references: 'users', onDelete: 'NO ACTION' },
    reason: { type: 'text', notNull: true },
    status: { type: 'varchar(20)', notNull: true, default: 'pending' },
    resolved_by: { type: 'uuid', references: 'users', onDelete: 'NO ACTION' },
    resolved_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('appointment_cancellation_requests', 'appointment_cancellation_requests_status_check', {
    check: "status IN ('pending', 'approved', 'rejected')",
  });

  // Nunca dos pedidos pendientes simultaneos para la misma cita (mismo patron que
  // idx_turns_one_in_progress): la BD es la fuente de verdad, no el codigo de aplicacion.
  pgm.createIndex('appointment_cancellation_requests', 'appointment_id', {
    name: 'idx_one_pending_request_per_appointment',
    unique: true,
    where: "status = 'pending'",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('appointment_cancellation_requests');
};
