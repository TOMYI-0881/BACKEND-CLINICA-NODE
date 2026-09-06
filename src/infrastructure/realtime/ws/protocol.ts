/**
 * Protocolo de mensajes WebSocket (seccion 7). Todas las mutaciones van por REST;
 * el WS solo difunde ('room-updated', 'queue-updated') o recibe suscripciones
 * ('join-doctor-room', 'leave-doctor-room'), nunca comandos de mutacion.
 */

export interface JoinDoctorRoomMessage {
  type: 'join-doctor-room';
  payload: { doctorId: string };
}

export interface LeaveDoctorRoomMessage {
  type: 'leave-doctor-room';
  payload: { doctorId: string };
}

export type ClientMessage = JoinDoctorRoomMessage | LeaveDoctorRoomMessage;

export interface ServerErrorMessage {
  type: 'error';
  payload: { message: string };
}

export function channelForDoctor(doctorId: string): string {
  return `doctor:${doctorId}`;
}

/** Valida un mensaje entrante crudo (JSON.parse de datos no confiables del cliente). */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  if (candidate['type'] !== 'join-doctor-room' && candidate['type'] !== 'leave-doctor-room') {
    return null;
  }

  const payload = candidate['payload'];
  if (typeof payload !== 'object' || payload === null) return null;
  const doctorId = (payload as Record<string, unknown>)['doctorId'];
  if (typeof doctorId !== 'string' || doctorId.length === 0) return null;

  return { type: candidate['type'], payload: { doctorId } };
}
