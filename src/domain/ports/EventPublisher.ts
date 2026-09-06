export interface DomainEvent {
  type: string;
  payload: unknown;
}

/**
 * Puerto de difusion de eventos en tiempo real (seccion 7). Deliberadamente
 * generico (un solo metodo `publish`, no un metodo por feature) para que agregar
 * un tercer tipo de evento no requiera tocar el dominio ni los casos de uso.
 * El canal usado en toda la app es `doctor:{doctorId}`.
 */
export interface EventPublisher {
  publish(channel: string, event: DomainEvent): Promise<void>;
}
