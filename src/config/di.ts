import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { env } from './env';

import { UserRepository } from '../domain/ports/UserRepository';
import { DoctorRepository } from '../domain/ports/DoctorRepository';
import { AppointmentRepository } from '../domain/ports/AppointmentRepository';
import { QueueRepository } from '../domain/ports/QueueRepository';
import { AppointmentCancellationRequestRepository } from '../domain/ports/AppointmentCancellationRequestRepository';
import { TokenService } from '../domain/ports/TokenService';
import { PasswordHasher } from '../domain/ports/PasswordHasher';
import { LockService } from '../domain/ports/LockService';
import { EventPublisher } from '../domain/ports/EventPublisher';
import { NotificationService } from '../domain/ports/NotificationService';
import { EmailService } from '../domain/ports/EmailService';

import { PostgresUserRepository } from '../infrastructure/database/postgres/PostgresUserRepository';
import { PostgresDoctorRepository } from '../infrastructure/database/postgres/PostgresDoctorRepository';
import { PostgresAppointmentRepository } from '../infrastructure/database/postgres/PostgresAppointmentRepository';
import { PostgresQueueRepository } from '../infrastructure/database/postgres/PostgresQueueRepository';
import { PostgresAppointmentCancellationRequestRepository } from '../infrastructure/database/postgres/PostgresAppointmentCancellationRequestRepository';
import { BcryptAdapter } from '../infrastructure/auth/BcryptAdapter';
import { JwtAdapter } from '../infrastructure/auth/JwtAdapter';
import { RedisLockService } from '../infrastructure/cache/redis/RedisLockService';
import { RedisPubSubEventPublisher } from '../infrastructure/realtime/ws/RedisPubSubEventPublisher';
import { DiscordNotificationService } from '../infrastructure/notifications/discord/DiscordNotificationService';
import { NodemailerEmailService } from '../infrastructure/notifications/email/NodemailerEmailService';

import { RegisterUser } from '../application/use-cases/RegisterUser';
import { LoginUser } from '../application/use-cases/LoginUser';
import { CreateDoctor } from '../application/use-cases/CreateDoctor';
import { ListDoctors } from '../application/use-cases/ListDoctors';
import { UpdateDoctor } from '../application/use-cases/UpdateDoctor';
import { DeactivateDoctor } from '../application/use-cases/DeactivateDoctor';
import { ResetDoctorPassword } from '../application/use-cases/ResetDoctorPassword';
import { GetAvailability } from '../application/use-cases/GetAvailability';
import { CreateAppointment } from '../application/use-cases/CreateAppointment';
import { CancelAppointment } from '../application/use-cases/CancelAppointment';
import { ListAppointments } from '../application/use-cases/ListAppointments';
import { ListMyAppointments } from '../application/use-cases/ListMyAppointments';
import { RequestAppointmentCancellation } from '../application/use-cases/RequestAppointmentCancellation';
import { ApproveCancellationRequest } from '../application/use-cases/ApproveCancellationRequest';
import { RejectCancellationRequest } from '../application/use-cases/RejectCancellationRequest';
import { ListPendingCancellationRequests } from '../application/use-cases/ListPendingCancellationRequests';
import { CheckInPatient } from '../application/use-cases/CheckInPatient';
import { CallNextTurn } from '../application/use-cases/CallNextTurn';
import { SkipTurn } from '../application/use-cases/SkipTurn';
import { RecallCurrentTurn } from '../application/use-cases/RecallCurrentTurn';
import { GetQueueStatus } from '../application/use-cases/GetQueueStatus';

import { createAuthController, AuthController } from '../presentation/http/controllers/auth.controller';
import { createDoctorsController, DoctorsController } from '../presentation/http/controllers/doctors.controller';
import {
  createAppointmentsController,
  AppointmentsController,
} from '../presentation/http/controllers/appointments.controller';
import { createQueuesController, QueuesController } from '../presentation/http/controllers/queues.controller';
import {
  createCancellationRequestsController,
  CancellationRequestsController,
} from '../presentation/http/controllers/cancellationRequests.controller';
import { createWebhooksController, WebhooksController } from '../presentation/http/controllers/webhooks.controller';
import { createHealthController, HealthController } from '../presentation/http/controllers/health.controller';

/**
 * Pool de conexiones unico compartido por toda la aplicacion.
 * Nunca crear un Client nuevo por request: este Pool se inyecta
 * por constructor en los repositorios de infraestructura.
 */
export const pgPool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/** Conexion Redis para comandos normales (locks, publish). Nunca se usa para SUBSCRIBE. */
export const redisConnection = new Redis(env.redisUrl, { maxRetriesPerRequest: 3 });

/**
 * Conexion Redis DEDICADA para el subscriber (seccion 9.3): en modo suscripcion
 * una conexion de ioredis no puede ejecutar otros comandos. Exportada (no
 * instanciada aca) para que index.ts decida cuando iniciar el subscriber, una
 * vez que el WebSocketServer (que depende del httpServer) ya existe.
 */
export const redisSubscriberConnection = new Redis(env.redisUrl, { maxRetriesPerRequest: 3 });

export interface AppContainer {
  pgPool: Pool;
  redis: Redis;
  redisSubscriberConnection: Redis;
  tokens: TokenService;
  repositories: {
    users: UserRepository;
    doctors: DoctorRepository;
    appointments: AppointmentRepository;
    queues: QueueRepository;
    cancellationRequests: AppointmentCancellationRequestRepository;
  };
  controllers: {
    auth: AuthController;
    doctors: DoctorsController;
    appointments: AppointmentsController;
    queues: QueuesController;
    cancellationRequests: CancellationRequestsController;
    webhooks: WebhooksController;
    health: HealthController;
  };
}

export function buildContainer(): AppContainer {
  const users: UserRepository = new PostgresUserRepository(pgPool);
  const doctors: DoctorRepository = new PostgresDoctorRepository(pgPool);
  const appointments: AppointmentRepository = new PostgresAppointmentRepository(pgPool);
  const queues: QueueRepository = new PostgresQueueRepository(pgPool);
  const cancellationRequests: AppointmentCancellationRequestRepository =
    new PostgresAppointmentCancellationRequestRepository(pgPool);

  const hasher: PasswordHasher = new BcryptAdapter();
  const tokens: TokenService = new JwtAdapter(env.jwtSecret, env.jwtExpiresIn);
  const lock: LockService = new RedisLockService(redisConnection);
  const events: EventPublisher = new RedisPubSubEventPublisher(redisConnection);
  const notifier: NotificationService = new DiscordNotificationService(env.discordWebhookUrl);
  const email: EmailService = new NodemailerEmailService({
    user: env.emailUser,
    pass: env.emailPassword,
    fromName: env.emailFromName,
    host: env.emailHost || undefined,
    port: env.emailPort,
  });

  const registerUser = new RegisterUser(users, hasher);
  const loginUser = new LoginUser(users, hasher, tokens);
  const createDoctor = new CreateDoctor(doctors, hasher);
  const listDoctors = new ListDoctors(doctors);
  const updateDoctor = new UpdateDoctor(doctors);
  const deactivateDoctor = new DeactivateDoctor(doctors, appointments, users, events, notifier, email);
  const resetDoctorPassword = new ResetDoctorPassword(doctors, users, hasher, email);
  const getAvailability = new GetAvailability(appointments);
  const createAppointment = new CreateAppointment(appointments, lock, events, notifier);
  const cancelAppointment = new CancelAppointment(appointments, users, events, notifier, email);
  const listAppointments = new ListAppointments(appointments);
  const listMyAppointments = new ListMyAppointments(appointments, doctors);
  const requestAppointmentCancellation = new RequestAppointmentCancellation(appointments, doctors, cancellationRequests);
  const approveCancellationRequest = new ApproveCancellationRequest(
    cancellationRequests,
    appointments,
    doctors,
    users,
    events,
    notifier,
    email,
  );
  const rejectCancellationRequest = new RejectCancellationRequest(cancellationRequests);
  const listPendingCancellationRequests = new ListPendingCancellationRequests(cancellationRequests);
  const checkInPatient = new CheckInPatient(queues, appointments, lock, events);
  const callNextTurn = new CallNextTurn(queues, events);
  const skipTurn = new SkipTurn(queues, events);
  const recallCurrentTurn = new RecallCurrentTurn(queues, events);
  const getQueueStatus = new GetQueueStatus(queues);

  return {
    pgPool,
    redis: redisConnection,
    redisSubscriberConnection,
    tokens,
    repositories: { users, doctors, appointments, queues, cancellationRequests },
    controllers: {
      auth: createAuthController({ registerUser, loginUser }),
      doctors: createDoctorsController({ createDoctor, listDoctors, updateDoctor, deactivateDoctor, resetDoctorPassword }),
      appointments: createAppointmentsController({
        createAppointment,
        cancelAppointment,
        getAvailability,
        listAppointments,
        listMyAppointments,
        requestAppointmentCancellation,
      }),
      queues: createQueuesController({
        checkInPatient,
        getQueueStatus,
        callNextTurn,
        skipTurn,
        recallCurrentTurn,
      }),
      cancellationRequests: createCancellationRequestsController({
        listPendingCancellationRequests,
        approveCancellationRequest,
        rejectCancellationRequest,
      }),
      webhooks: createWebhooksController({ notifier }),
      health: createHealthController({ pgPool, redis: redisConnection }),
    },
  };
}
