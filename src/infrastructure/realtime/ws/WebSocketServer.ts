import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer as WsLibServer } from 'ws';

/**
 * Singleton por proceso: mantiene solo las conexiones LOCALES de esta instancia
 * de la API (Map<canal, Set<WebSocket>>). Escala horizontalmente gracias al
 * relay de RedisSubscriber (seccion 9.3) -- este server nunca habla con otras
 * instancias directamente.
 */
export class WebSocketServer {
  private readonly wss: WsLibServer;
  private readonly rooms = new Map<string, Set<WebSocket>>();

  constructor(httpServer: HttpServer, path = '/ws') {
    this.wss = new WsLibServer({ server: httpServer, path });
    this.wss.on('connection', (socket) => {
      socket.on('close', () => this.removeFromAllRooms(socket));
      socket.on('error', () => this.removeFromAllRooms(socket));
    });
  }

  onConnection(handler: (socket: WebSocket) => void): void {
    this.wss.on('connection', handler);
  }

  join(channel: string, socket: WebSocket): void {
    let sockets = this.rooms.get(channel);
    if (!sockets) {
      sockets = new Set();
      this.rooms.set(channel, sockets);
    }
    sockets.add(socket);
  }

  leave(channel: string, socket: WebSocket): void {
    this.rooms.get(channel)?.delete(socket);
  }

  private removeFromAllRooms(socket: WebSocket): void {
    for (const sockets of this.rooms.values()) {
      sockets.delete(socket);
    }
  }

  /** Difunde un mensaje ya serializado a todas las conexiones locales suscritas a `channel`. */
  broadcastRaw(channel: string, rawMessage: string): void {
    const sockets = this.rooms.get(channel);
    if (!sockets) return;
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(rawMessage);
      }
    }
  }

  roomSize(channel: string): number {
    return this.rooms.get(channel)?.size ?? 0;
  }

  close(): void {
    this.wss.close();
  }
}
