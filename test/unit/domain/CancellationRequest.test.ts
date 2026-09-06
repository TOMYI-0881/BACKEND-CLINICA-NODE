import { CancellationRequest } from '../../../src/domain/entities/CancellationRequest';
import { ValidationError } from '../../../src/domain/errors/ValidationError';

const baseProps = {
  id: 'req-1',
  appointmentId: 'apt-1',
  requestedBy: 'doctor-user-1',
  status: 'pending' as const,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('CancellationRequest', () => {
  it('crea un pedido valido', () => {
    const request = CancellationRequest.create({ ...baseProps, reason: 'Emergencia medica' });
    expect(request.reason).toBe('Emergencia medica');
    expect(request.isPending()).toBe(true);
  });

  it('rechaza un motivo vacio', () => {
    expect(() => CancellationRequest.create({ ...baseProps, reason: '  ' })).toThrow(ValidationError);
  });

  it('isPending() es false una vez resuelto', () => {
    const resolved = CancellationRequest.create({
      ...baseProps,
      reason: 'Emergencia medica',
      status: 'approved',
      resolvedBy: 'admin-1',
      resolvedAt: new Date(),
    });
    expect(resolved.isPending()).toBe(false);
  });
});
