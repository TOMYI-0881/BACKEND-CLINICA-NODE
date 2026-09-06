import { RejectCancellationRequest } from '../../../src/application/use-cases/RejectCancellationRequest';
import { CancellationRequest } from '../../../src/domain/entities/CancellationRequest';
import { ValidationError } from '../../../src/domain/errors/ValidationError';
import { makeCancellationRequestRepo } from './mocks';

describe('RejectCancellationRequest', () => {
  it('rechaza el pedido delegando en el repositorio', async () => {
    const cancellationRequests = makeCancellationRequestRepo();
    const rejected = CancellationRequest.create({
      id: 'req-1',
      appointmentId: 'apt-1',
      requestedBy: 'user-doc-1',
      reason: 'Emergencia',
      status: 'rejected',
      resolvedBy: 'admin-1',
      resolvedAt: new Date(),
      createdAt: new Date(),
    });
    cancellationRequests.resolve.mockResolvedValue(rejected);

    const useCase = new RejectCancellationRequest(cancellationRequests);
    const result = await useCase.execute('req-1', 'admin-1');

    expect(cancellationRequests.resolve).toHaveBeenCalledWith('req-1', 'rejected', 'admin-1');
    expect(result).toBe(rejected);
  });

  it('propaga el error si el pedido ya fue resuelto', async () => {
    const cancellationRequests = makeCancellationRequestRepo();
    cancellationRequests.resolve.mockRejectedValue(new ValidationError('Este pedido ya fue resuelto'));

    const useCase = new RejectCancellationRequest(cancellationRequests);
    await expect(useCase.execute('req-1', 'admin-1')).rejects.toThrow(ValidationError);
  });
});
