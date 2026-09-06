import { Redis } from 'ioredis';
import { DomainEvent, EventPublisher } from '../../../domain/ports/EventPublisher';

/**
 * Unico adaptador que conoce el formato final del mensaje (seccion 9.3): hace
 * `redis.publish(channel, JSON.stringify(event))`. Los casos de uso solo conocen
 * la interfaz generica EventPublisher, indiferentes a cuantas instancias de la
 * API esten corriendo.
 */
export class RedisPubSubEventPublisher implements EventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(channel: string, event: DomainEvent): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(event));
  }
}
