import { Redis } from 'ioredis';
import { WebSocketServer } from './WebSocketServer';

const DOCTOR_CHANNEL_PATTERN = 'doctor:*';

/**
 * Relay entre instancias (seccion 9.3): proceso separado con su PROPIA conexion
 * ioredis (en modo suscripcion una conexion no puede ejecutar otros comandos).
 * Al recibir un mensaje publicado por cualquier instancia, lo reenvia al
 * WebSocketServer LOCAL de esta misma instancia para difundirlo a sus propios
 * clientes conectados -- asi un evento publicado en la instancia A llega a los
 * clientes de la instancia B, C, etc.
 */
export class RedisSubscriber {
  constructor(
    private readonly subscriberConnection: Redis,
    private readonly wsServer: WebSocketServer,
  ) {}

  async start(): Promise<void> {
    await this.subscriberConnection.psubscribe(DOCTOR_CHANNEL_PATTERN);
    this.subscriberConnection.on('pmessage', (_pattern: string, channel: string, message: string) => {
      this.wsServer.broadcastRaw(channel, message);
    });
  }

  async stop(): Promise<void> {
    await this.subscriberConnection.punsubscribe(DOCTOR_CHANNEL_PATTERN);
  }
}
