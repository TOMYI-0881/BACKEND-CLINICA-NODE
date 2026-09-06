import http, { Server } from 'http';
import { AddressInfo } from 'net';
import { DiscordNotificationService } from '../../src/infrastructure/notifications/discord/DiscordNotificationService';

function startMockDiscordServer(handler: (body: string, res: http.ServerResponse) => void): Promise<{
  server: Server;
  url: string;
}> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => handler(body, res));
    });
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('DiscordNotificationService', () => {
  it('envia un POST con el mensaje como content', async () => {
    let receivedBody = '';
    const { server, url } = await startMockDiscordServer((body, res) => {
      receivedBody = body;
      res.writeHead(200);
      res.end();
    });

    const service = new DiscordNotificationService(url);
    await service.notify('hola mundo');

    expect(JSON.parse(receivedBody)).toEqual({ content: 'hola mundo' });
    await closeServer(server);
  });

  it('lanza un error si Discord responde con status no-ok', async () => {
    const { server, url } = await startMockDiscordServer((_body, res) => {
      res.writeHead(500);
      res.end();
    });

    const service = new DiscordNotificationService(url);
    await expect(service.notify('falla')).rejects.toThrow('status 500');

    await closeServer(server);
  });

  it('aborta la request si supera el timeout configurado', async () => {
    const { server, url } = await startMockDiscordServer((_body, res) => {
      const timer = setTimeout(() => {
        res.writeHead(200);
        res.end();
      }, 2000);
      res.req.on('close', () => clearTimeout(timer));
    });

    const service = new DiscordNotificationService(url, 200);
    await expect(service.notify('lento')).rejects.toThrow();

    await closeServer(server);
  });

  it('no hace ninguna llamada si no hay webhookUrl configurada (no-op)', async () => {
    const service = new DiscordNotificationService('');
    await expect(service.notify('sin webhook')).resolves.toBeUndefined();
  });
});
