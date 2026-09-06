import { logger } from '../config/logger';

/**
 * Usado para operaciones no criticas (notificaciones, difusion de eventos) que
 * nunca deben bloquear ni romper la respuesta HTTP del flujo de negocio principal
 * (seccion 9.4, punto 4).
 */
export function logError(err: unknown): void {
  logger.error({ err }, 'Error en operacion no critica');
}
