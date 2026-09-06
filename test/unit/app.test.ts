import request from 'supertest';
import { createApp } from '../../src/app';
import { buildFakeContainer } from './fakeContainer';

describe('GET /health', () => {
  it('responde 200 ok', async () => {
    const app = createApp(buildFakeContainer());
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('rate limiting en /api/auth/login', () => {
  it('responde 429 al superar el limite de intentos', async () => {
    const app = createApp(buildFakeContainer());

    let lastStatus = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app).post('/api/auth/login').send({});
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});

describe('GET /api-docs', () => {
  it('sirve la documentacion swagger', async () => {
    const app = createApp(buildFakeContainer());
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger');
  });
});
