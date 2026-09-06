import request from 'supertest';
import { createApp } from '../../src/app';
import { buildFakeContainer } from './fakeContainer';
import { TokenService, TokenPayload } from '../../src/domain/ports/TokenService';
import { UnauthorizedError } from '../../src/domain/errors/UnauthorizedError';
import { Doctor } from '../../src/domain/entities/Doctor';
import { AppContainer } from '../../src/config/di';

/** Token "falso" que solo serializa/deserializa el payload como JSON, sin criptografia real. */
const fakeTokens: TokenService = {
  sign: (payload: TokenPayload) => JSON.stringify(payload),
  verify: (token: string) => {
    try {
      return JSON.parse(token) as TokenPayload;
    } catch {
      throw new UnauthorizedError('Token invalido');
    }
  },
};

function bearerFor(payload: TokenPayload): string {
  return `Bearer ${fakeTokens.sign(payload)}`;
}

describe('Reglas de autorizacion exactas (seccion 5/6 del criterio de aceptacion de Fase 5)', () => {
  const app = createApp(buildFakeContainer({ tokens: fakeTokens }));

  it('un request sin JWT a una ruta protegida responde 401', async () => {
    const res = await request(app).get('/api/appointments');
    expect(res.status).toBe(401);
  });

  it('un PATIENT que llama GET /appointments recibe 403 (no 401)', async () => {
    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', bearerFor({ userId: 'p1', role: 'PATIENT' }));
    expect(res.status).toBe(403);
  });

  it('un ADMIN que llama GET /appointments es autorizado (llega al controlador)', async () => {
    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', bearerFor({ userId: 'a1', role: 'ADMIN' }));
    expect(res.status).toBe(200);
  });

  it('un PATIENT que llama POST /queues/:doctorId/next recibe 403', async () => {
    const res = await request(app)
      .post('/api/queues/doc-1/next')
      .set('Authorization', bearerFor({ userId: 'p1', role: 'PATIENT' }));
    expect(res.status).toBe(403);
  });

  it('un ADMIN que llama POST /queues/:doctorId/next es autorizado', async () => {
    const res = await request(app)
      .post('/api/queues/doc-1/next')
      .set('Authorization', bearerFor({ userId: 'a1', role: 'ADMIN' }));
    expect(res.status).toBe(200);
  });

  it('un token invalido responde 401', async () => {
    const res = await request(app).get('/api/appointments').set('Authorization', 'Bearer token-basura');
    expect(res.status).toBe(401);
  });

  it('POST /doctors sin JWT responde 401; con PATIENT responde 403; con ADMIN pasa', async () => {
    const noAuth = await request(app).post('/api/doctors').send({});
    expect(noAuth.status).toBe(401);

    const asPatient = await request(app)
      .post('/api/doctors')
      .set('Authorization', bearerFor({ userId: 'p1', role: 'PATIENT' }))
      .send({});
    expect(asPatient.status).toBe(403);

    const asAdmin = await request(app)
      .post('/api/doctors')
      .set('Authorization', bearerFor({ userId: 'a1', role: 'ADMIN' }))
      .send({});
    expect(asAdmin.status).toBe(200);
  });
});

describe('DOCTOR solo puede operar su propia cola (requireAdminOrOwnDoctor)', () => {
  function buildDoctor(id: string, userId: string): Doctor {
    return Doctor.create({ id, userId, name: 'Dr. Test', specialty: 'Test', isActive: true, createdAt: new Date() });
  }

  function buildAppWithDoctor(ownerUserId: string, ownDoctorId: string) {
    const doctors: AppContainer['repositories']['doctors'] = {
      createDoctorAccount: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(async (userId: string) =>
        userId === ownerUserId ? buildDoctor(ownDoctorId, ownerUserId) : null,
      ),
      update: jest.fn(),
      deactivate: jest.fn(),
    };
    return createApp(
      buildFakeContainer({
        tokens: fakeTokens,
        repositories: {
          users: {} as AppContainer['repositories']['users'],
          doctors,
          appointments: {} as AppContainer['repositories']['appointments'],
          queues: {} as AppContainer['repositories']['queues'],
          cancellationRequests: {} as AppContainer['repositories']['cancellationRequests'],
        },
      }),
    );
  }

  it('un DOCTOR puede llamar next sobre su propia cola', async () => {
    const app = buildAppWithDoctor('user-doc-1', 'doc-1');
    const res = await request(app)
      .post('/api/queues/doc-1/next')
      .set('Authorization', bearerFor({ userId: 'user-doc-1', role: 'DOCTOR' }));
    expect(res.status).toBe(200);
  });

  it('un DOCTOR NO puede llamar next sobre la cola de otro doctor (403)', async () => {
    const app = buildAppWithDoctor('user-doc-1', 'doc-1');
    const res = await request(app)
      .post('/api/queues/doc-OTRO/next')
      .set('Authorization', bearerFor({ userId: 'user-doc-1', role: 'DOCTOR' }));
    expect(res.status).toBe(403);
  });

  it('un PATIENT sigue pudiendo hacer check-in (no requiere ser doctor ni admin)', async () => {
    const app = buildAppWithDoctor('user-doc-1', 'doc-1');
    const res = await request(app)
      .post('/api/queues/doc-1/check-in')
      .set('Authorization', bearerFor({ userId: 'p1', role: 'PATIENT' }))
      .send({ patientName: 'Juan', priority: 'normal' });
    // El controlador stub del fake container siempre responde 200; lo que se prueba aca
    // es que el middleware de autorizacion deja pasar a PATIENT (no que devuelva 201).
    expect(res.status).toBe(200);
  });
});

describe('POST /appointments/:id/request-cancellation es exclusivo del rol DOCTOR', () => {
  const app = createApp(buildFakeContainer({ tokens: fakeTokens }));

  it('un ADMIN recibe 403 (solo el DOCTOR pide, el ADMIN aprueba/rechaza)', async () => {
    const res = await request(app)
      .post('/api/appointments/apt-1/request-cancellation')
      .set('Authorization', bearerFor({ userId: 'a1', role: 'ADMIN' }))
      .send({ reason: 'Emergencia' });
    expect(res.status).toBe(403);
  });

  it('un DOCTOR es autorizado (llega al controlador)', async () => {
    const res = await request(app)
      .post('/api/appointments/apt-1/request-cancellation')
      .set('Authorization', bearerFor({ userId: 'user-doc-1', role: 'DOCTOR' }))
      .send({ reason: 'Emergencia' });
    expect(res.status).toBe(200);
  });
});
