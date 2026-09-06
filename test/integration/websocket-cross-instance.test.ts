import http, { Server } from 'http';
import { AddressInfo } from 'net';
import { Redis } from 'ioredis';
import WebSocket from 'ws';
import { Pool } from 'pg';
import { WebSocketServer } from '../../src/infrastructure/realtime/ws/WebSocketServer';
import { RedisSubscriber } from '../../src/infrastructure/realtime/ws/RedisSubscriber';
import { RedisPubSubEventPublisher } from '../../src/infrastructure/realtime/ws/RedisPubSubEventPublisher';
import { PostgresDoctorRepository } from '../../src/infrastructure/database/postgres/PostgresDoctorRepository';
import { createMessageRouter } from '../../src/presentation/websocket/message-router';
import { env } from '../../src/config/env';
import { createTestPool, truncateAll, createTestDoctor } from './db';

interface Instance {
  httpServer: Server;
  wsServer: WebSocketServer;
  subscriberConnection: Redis;
  subscriber: RedisSubscriber;
  port: number;
}

async function startInstance(pool: Pool): Promise<Instance> {
  const httpServer = http.createServer();
  const wsServer = new WebSocketServer(httpServer);
  const doctorRepo = new PostgresDoctorRepository(pool);
  wsServer.onConnection(createMessageRouter(wsServer, doctorRepo));

  const subscriberConnection = new Redis(env.redisUrl);
  const subscriber = new RedisSubscriber(subscriberConnection, wsServer);
  await subscriber.start();

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  return { httpServer, wsServer, subscriberConnection, subscriber, port };
}

async function stopInstance(instance: Instance): Promise<void> {
  await instance.subscriber.stop();
  await instance.subscriberConnection.quit();
  instance.wsServer.close();
  await new Promise<void>((resolve) => instance.httpServer.close(() => resolve()));
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitForMessage(socket: WebSocket, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout esperando mensaje')), timeoutMs);
    socket.once('message', (raw: Buffer) => {
      clearTimeout(timeout);
      resolve(JSON.parse(raw.toString('utf-8')) as Record<string, unknown>);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Escalabilidad horizontal real: 2 instancias de WebSocketServer + mismo Redis', () => {
  let pool: Pool;
  let publisherConnection: Redis;
  let publisher: RedisPubSubEventPublisher;
  let instanceA: Instance;
  let instanceB: Instance;
  let doctorId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await truncateAll(pool);
    const doctorRepo = new PostgresDoctorRepository(pool);
    const doctor = await createTestDoctor(doctorRepo,{ name: 'Dr. WS Cross-Instance', specialty: 'Test' });
    doctorId = doctor.id;

    publisherConnection = new Redis(env.redisUrl);
    publisher = new RedisPubSubEventPublisher(publisherConnection);

    instanceA = await startInstance(pool);
    instanceB = await startInstance(pool);
  });

  afterAll(async () => {
    await stopInstance(instanceA);
    await stopInstance(instanceB);
    await publisherConnection.quit();
    await pool.end();
  });

  it('un evento publicado desde la instancia A llega al cliente conectado a la instancia B', async () => {
    const clientA = await connectClient(instanceA.port);
    const clientB = await connectClient(instanceB.port);

    // Solo el cliente B se suscribe a la sala del doctor.
    clientB.send(JSON.stringify({ type: 'join-doctor-room', payload: { doctorId } }));
    await sleep(300); // el join hace una consulta async a Postgres antes de unirse a la sala

    const receivedOnB = waitForMessage(clientB);
    const receivedOnAPromise = new Promise<'received' | 'timeout'>((resolve) => {
      const timeout = setTimeout(() => resolve('timeout'), 1000);
      clientA.once('message', () => {
        clearTimeout(timeout);
        resolve('received');
      });
    });

    // Se publica desde el "proceso" de la instancia A (misma Redis que B).
    await publisher.publish(`doctor:${doctorId}`, {
      type: 'room-updated',
      payload: { doctorId, availability: [] },
    });

    const messageOnB = await receivedOnB;
    expect(messageOnB).toEqual({ type: 'room-updated', payload: { doctorId, availability: [] } });

    // El cliente A nunca se unio a la sala: no debe recibir nada.
    expect(await receivedOnAPromise).toBe('timeout');

    clientA.close();
    clientB.close();
  });

  it('leave-doctor-room detiene la difusion hacia ese cliente', async () => {
    const client = await connectClient(instanceB.port);
    client.send(JSON.stringify({ type: 'join-doctor-room', payload: { doctorId } }));
    await sleep(300);

    client.send(JSON.stringify({ type: 'leave-doctor-room', payload: { doctorId } }));
    await sleep(100);

    const timedOut = new Promise<'timeout' | 'received'>((resolve) => {
      const timeout = setTimeout(() => resolve('timeout'), 800);
      client.once('message', () => {
        clearTimeout(timeout);
        resolve('received');
      });
    });

    await publisher.publish(`doctor:${doctorId}`, { type: 'queue-updated', payload: { doctorId } });

    expect(await timedOut).toBe('timeout');
    client.close();
  });

  it('responde con type "error" ante un doctorId inexistente', async () => {
    const client = await connectClient(instanceA.port);
    const errorPromise = waitForMessage(client);

    client.send(
      JSON.stringify({ type: 'join-doctor-room', payload: { doctorId: '00000000-0000-0000-0000-000000000000' } }),
    );

    const message = await errorPromise;
    expect(message['type']).toBe('error');
    client.close();
  });

  it('responde con type "error" ante un mensaje mal formado', async () => {
    const client = await connectClient(instanceA.port);
    const errorPromise = waitForMessage(client);

    client.send('esto no es json');

    const message = await errorPromise;
    expect(message['type']).toBe('error');
    client.close();
  });
});
