import { SMTPServer } from 'smtp-server';
import { AddressInfo } from 'net';
import { NodemailerEmailService } from '../../src/infrastructure/notifications/email/NodemailerEmailService';

interface ReceivedMail {
  from: string | false;
  to: string[];
  body: string;
}

function startMockSmtpServer(onMail: (mail: ReceivedMail) => void): Promise<{ server: SMTPServer; port: number }> {
  return new Promise((resolve) => {
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      // Sin esto, nodemailer intenta AUTH (le pasamos user/pass) y el servidor de prueba
      // responde "535 Authentication not implemented" -- acepta cualquier credencial.
      onAuth(auth, _session, callback) {
        callback(null, { user: auth.username });
      },
      onData(stream, session, callback) {
        let body = '';
        stream.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        stream.on('end', () => {
          onMail({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : false, to: session.envelope.rcptTo.map((r) => r.address), body });
          callback();
        });
      },
    });
    server.listen(0, () => {
      const port = (server.server.address() as AddressInfo).port;
      resolve({ server, port });
    });
  });
}

function closeServer(server: SMTPServer): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('NodemailerEmailService contra un servidor SMTP local falso', () => {
  it('envia un email con destinatario, asunto y cuerpo correctos', async () => {
    let received: ReceivedMail | undefined;
    const { server, port } = await startMockSmtpServer((mail) => {
      received = mail;
    });

    const service = new NodemailerEmailService({
      user: 'clinica@test.com',
      pass: 'irrelevante',
      host: '127.0.0.1',
      port,
      secure: false,
    });

    await service.send('paciente@test.com', 'Cita cancelada', 'Tu cita fue cancelada.');

    expect(received?.to).toEqual(['paciente@test.com']);
    expect(received?.body).toContain('Cita cancelada');
    expect(received?.body).toContain('Tu cita fue cancelada.');

    await closeServer(server);
  });

  it('no hace ninguna llamada si no hay credenciales configuradas (no-op)', async () => {
    const service = new NodemailerEmailService({ user: '', pass: '' });
    await expect(service.send('paciente@test.com', 'Asunto', 'Cuerpo')).resolves.toBeUndefined();
  });
});
