import http from 'http';
import { createApp } from './app';
import { buildContainer, redisSubscriberConnection } from './config/di';
import { env } from './config/env';
import { logger } from './config/logger';
import { WebSocketServer } from './infrastructure/realtime/ws/WebSocketServer';
import { RedisSubscriber } from './infrastructure/realtime/ws/RedisSubscriber';
import { createMessageRouter } from './presentation/websocket/message-router';

async function main(): Promise<void> {
  const container = buildContainer();
  const app = createApp(container);
  const httpServer = http.createServer(app);

  const wsServer = new WebSocketServer(httpServer);
  wsServer.onConnection(createMessageRouter(wsServer, container.repositories.doctors));

  const subscriber = new RedisSubscriber(redisSubscriberConnection, wsServer);
  await subscriber.start();

  httpServer.listen(env.port, () => {
    logger.info({ port: env.port }, 'API escuchando');
  });
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Error fatal al iniciar el servidor');
  process.exit(1);
});
