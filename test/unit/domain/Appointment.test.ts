import { Appointment } from '../../../src/domain/entities/Appointment';
import { ValidationError } from '../../../src/domain/errors/ValidationError';

const baseProps = {
  id: 'apt-1',
  doctorId: 'doc-1',
  patientId: 'pat-1',
  status: 'CONFIRMED' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('Appointment', () => {
  it('crea una reserva valida', () => {
    const appointment = Appointment.create({
      ...baseProps,
      startTime: new Date('2026-01-02T10:00:00Z'),
      endTime: new Date('2026-01-02T11:00:00Z'),
    });
    expect(appointment.id).toBe('apt-1');
    expect(appointment.isConfirmed()).toBe(true);
  });

  it('rechaza endTime <= startTime', () => {
    expect(() =>
      Appointment.create({
        ...baseProps,
        startTime: new Date('2026-01-02T11:00:00Z'),
        endTime: new Date('2026-01-02T11:00:00Z'),
      }),
    ).toThrow(ValidationError);

    expect(() =>
      Appointment.create({
        ...baseProps,
        startTime: new Date('2026-01-02T11:00:00Z'),
        endTime: new Date('2026-01-02T10:00:00Z'),
      }),
    ).toThrow(ValidationError);
  });

  it('cancel() retorna una nueva instancia con status CANCELLED sin mutar la original', () => {
    const appointment = Appointment.create({
      ...baseProps,
      startTime: new Date('2026-01-02T10:00:00Z'),
      endTime: new Date('2026-01-02T11:00:00Z'),
    });
    const cancelled = appointment.cancel();
    expect(appointment.status).toBe('CONFIRMED');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('belongsTo() identifica al dueno de la reserva', () => {
    const appointment = Appointment.create({
      ...baseProps,
      startTime: new Date('2026-01-02T10:00:00Z'),
      endTime: new Date('2026-01-02T11:00:00Z'),
    });
    expect(appointment.belongsTo('pat-1')).toBe(true);
    expect(appointment.belongsTo('otro-paciente')).toBe(false);
  });

  describe('flujo de cancelacion pedida por un DOCTOR (rol DOCTOR)', () => {
    function buildConfirmed() {
      return Appointment.create({
        ...baseProps,
        startTime: new Date('2026-01-02T10:00:00Z'),
        endTime: new Date('2026-01-02T11:00:00Z'),
      });
    }

    it('requestCancellation() pasa de CONFIRMED a CANCELLATION_REQUESTED', () => {
      const requested = buildConfirmed().requestCancellation();
      expect(requested.status).toBe('CANCELLATION_REQUESTED');
    });

    it('requestCancellation() rechaza si no esta CONFIRMED', () => {
      const requested = buildConfirmed().requestCancellation();
      expect(() => requested.requestCancellation()).toThrow(ValidationError);
    });

    it('approveCancellation() pasa de CANCELLATION_REQUESTED a CANCELLED', () => {
      const requested = buildConfirmed().requestCancellation();
      expect(requested.approveCancellation().status).toBe('CANCELLED');
    });

    it('approveCancellation() rechaza si no hay pedido pendiente', () => {
      expect(() => buildConfirmed().approveCancellation()).toThrow(ValidationError);
    });

    it('rejectCancellation() vuelve a CONFIRMED', () => {
      const requested = buildConfirmed().requestCancellation();
      expect(requested.rejectCancellation().status).toBe('CONFIRMED');
    });

    it('rejectCancellation() rechaza si no hay pedido pendiente', () => {
      expect(() => buildConfirmed().rejectCancellation()).toThrow(ValidationError);
    });

    it('belongsToDoctor() identifica al doctor de la reserva', () => {
      const appointment = buildConfirmed();
      expect(appointment.belongsToDoctor('doc-1')).toBe(true);
      expect(appointment.belongsToDoctor('otro-doctor')).toBe(false);
    });
  });

  describe('overlapsWith (semantica [start, end) igual a tsrange)', () => {
    const appointment = Appointment.create({
      ...baseProps,
      startTime: new Date('2026-01-02T10:00:00Z'),
      endTime: new Date('2026-01-02T11:00:00Z'),
    });

    it('detecta solapamiento parcial', () => {
      expect(appointment.overlapsWith(new Date('2026-01-02T10:30:00Z'), new Date('2026-01-02T11:30:00Z'))).toBe(
        true,
      );
    });

    it('citas consecutivas (10-11 y 11-12) NO se solapan', () => {
      expect(appointment.overlapsWith(new Date('2026-01-02T11:00:00Z'), new Date('2026-01-02T12:00:00Z'))).toBe(
        false,
      );
    });

    it('citas consecutivas hacia atras (9-10 y 10-11) NO se solapan', () => {
      expect(appointment.overlapsWith(new Date('2026-01-02T09:00:00Z'), new Date('2026-01-02T10:00:00Z'))).toBe(
        false,
      );
    });
  });
});
