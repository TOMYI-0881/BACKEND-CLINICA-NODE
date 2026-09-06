/**
 * Puerto de envio de emails transaccionales (notificar al paciente cuando una cita se
 * cancela). Deliberadamente distinto de NotificationService (que solo maneja Discord con un
 * unico string): un email necesita destinatario y asunto ademas del cuerpo.
 */
export interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}
