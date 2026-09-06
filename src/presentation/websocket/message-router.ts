import { RawData, WebSocket } from 'ws';
import { WebSocketServer } from '../../infrastructure/realtime/ws/WebSocketServer';
import { channelForDoctor, parseClientMessage } from '../../infrastructure/realtime/ws/protocol';
import { DoctorRepository } from '../../domain/ports/DoctorRepository';

function sendError(socket: WebSocket, message: string): void {
  socket.send(JSON.stringify({ type: 'error', payload: { message } }));
}

function rawDataToString(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf-8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf-8');
  return Buffer.from(raw).toString('utf-8');
}

/**
 * Unico punto de entrada de mensajes de cliente por WS (seccion 7): solo
 * join/leave de salas. Cualquier mutacion de negocio va por REST.
 */
export function createMessageRouter(wsServer: WebSocketServer, doctors: DoctorRepository) {
  return function handleConnection(socket: WebSocket): void {
    socket.on('message', (raw: RawData) => {
      handleMessage(socket, raw).catch(() => sendError(socket, 'Error interno procesando el mensaje'));
    });
  };

  async function handleMessage(socket: WebSocket, raw: RawData): Promise<void> {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawDataToString(raw));
    } catch {
      sendError(socket, 'Mensaje mal formado');
      return;
    }

    const message = parseClientMessage(parsedJson);
    if (!message) {
      sendError(socket, 'Mensaje mal formado');
      return;
    }

    const doctor = await doctors.findById(message.payload.doctorId);
    if (!doctor) {
      sendError(socket, 'doctorId inexistente');
      return;
    }

    const channel = channelForDoctor(message.payload.doctorId);
    if (message.type === 'join-doctor-room') {
      wsServer.join(channel, socket);
    } else {
      wsServer.leave(channel, socket);
    }
  }
}
