import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';
import { githubSignatureMiddleware } from '../../src/infrastructure/webhooks/github/GithubSignatureMiddleware';
import { parseGithubEvent, formatGithubEventMessage } from '../../src/infrastructure/webhooks/github/GithubEventParser';

const SECRET = 'test-secret';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function buildApp(): express.Express {
  const app = express();
  app.post(
    '/webhooks/github',
    express.raw({ type: 'application/json' }),
    githubSignatureMiddleware(SECRET),
    (req, res) => {
      const event = parseGithubEvent(req.body as Buffer, req.header('x-github-event'));
      res.status(200).json({ message: formatGithubEventMessage(event) });
    },
  );
  return app;
}

describe('GithubSignatureMiddleware (HMAC-SHA256, x-hub-signature-256)', () => {
  const payload = JSON.stringify({
    action: 'opened',
    repository: { full_name: 'org/repo' },
    sender: { login: 'octocat' },
  });

  it('acepta un payload con firma valida', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(payload))
      .set('x-github-event', 'pull_request')
      .send(payload);

    const body = res.body as { message: string };
    expect(res.status).toBe(200);
    expect(body.message).toContain('pull_request');
    expect(body.message).toContain('opened');
    expect(body.message).toContain('org/repo');
    expect(body.message).toContain('octocat');
  });

  it('rechaza con 401 una firma invalida', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=firmaincorrecta')
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('rechaza con 401 si no hay firma', async () => {
    const app = buildApp();
    const res = await request(app).post('/webhooks/github').set('Content-Type', 'application/json').send(payload);

    expect(res.status).toBe(401);
  });

  it('rechaza con 401 si el payload fue modificado tras firmarse', async () => {
    const app = buildApp();
    const tamperedPayload = JSON.stringify({ action: 'closed', repository: { full_name: 'org/repo' } });

    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(payload)) // firma del payload original
      .send(tamperedPayload); // pero se envia otro payload

    expect(res.status).toBe(401);
  });
});
