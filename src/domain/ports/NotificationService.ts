/**
 * Puerto de notificaciones externas (seccion 9.4). Un solo metodo reutilizado
 * tanto por eventos de negocio (reserva creada/cancelada/bloqueada) como por el
 * webhook de GitHub. Toda llamada desde un caso de uso debe ir en `.catch(logError)`,
 * nunca bloqueante hacia la respuesta HTTP.
 */
export interface NotificationService {
  notify(message: string): Promise<void>;
}
