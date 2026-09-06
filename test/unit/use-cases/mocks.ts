import { AppointmentRepository } from '../../../src/domain/ports/AppointmentRepository';
import { QueueRepository } from '../../../src/domain/ports/QueueRepository';
import { LockService } from '../../../src/domain/ports/LockService';
import { EventPublisher } from '../../../src/domain/ports/EventPublisher';
import { NotificationService } from '../../../src/domain/ports/NotificationService';
import { UserRepository } from '../../../src/domain/ports/UserRepository';
import { DoctorRepository } from '../../../src/domain/ports/DoctorRepository';
import { EmailService } from '../../../src/domain/ports/EmailService';
import { AppointmentCancellationRequestRepository } from '../../../src/domain/ports/AppointmentCancellationRequestRepository';

export function makeAppointmentRepo(): jest.Mocked<AppointmentRepository> {
  return {
    save: jest.fn(),
    findById: jest.fn(),
    findByPatient: jest.fn(),
    findByDoctor: jest.fn(),
    findAll: jest.fn(),
    findBlockingByDoctorAndDate: jest.fn().mockResolvedValue([]),
    findFutureConfirmedByDoctor: jest.fn().mockResolvedValue([]),
    cancel: jest.fn(),
  };
}

export function makeQueueRepo(): jest.Mocked<QueueRepository> {
  return {
    checkIn: jest.fn(),
    getStatus: jest.fn().mockResolvedValue({ current: null, waiting: [] }),
    findCurrent: jest.fn(),
    callNext: jest.fn(),
    skip: jest.fn(),
  };
}

export function makeLockService(): jest.Mocked<LockService> {
  return {
    acquire: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

export function makeEventPublisher(): jest.Mocked<EventPublisher> {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

export function makeNotificationService(): jest.Mocked<NotificationService> {
  return { notify: jest.fn().mockResolvedValue(undefined) };
}

export function makeUserRepo(): jest.Mocked<UserRepository> {
  return {
    save: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    updatePasswordHash: jest.fn().mockResolvedValue(undefined),
  };
}

export function makeDoctorRepo(): jest.Mocked<DoctorRepository> {
  return {
    createDoctorAccount: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  };
}

export function makeEmailService(): jest.Mocked<EmailService> {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

export function makeCancellationRequestRepo(): jest.Mocked<AppointmentCancellationRequestRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findAllPending: jest.fn().mockResolvedValue([]),
    resolve: jest.fn(),
  };
}
