import { Appointment } from './Appointment';

export interface Slot {
  startTime: string;
  endTime: string;
}

/**
 * Horario de atencion y granularidad de turnos. El documento maestro no define
 * el horario de la clinica ni la duracion de los slots de disponibilidad; se
 * asume un horario 09:00-18:00 UTC con slots de 30 minutos (valor razonable
 * para turnos medicos, coherente con la granularidad de 15 min del lock de
 * Redis en la seccion 9.2). Se deja como constante unica para poder ajustarse
 * facilmente si el requisito real difiere.
 */
export const CLINIC_OPEN_HOUR_UTC = 9;
export const CLINIC_CLOSE_HOUR_UTC = 18;
export const SLOT_DURATION_MINUTES = 30;

/**
 * Calcula los huecos libres de un doctor en un dia dado, a partir de sus citas
 * CONFIRMED existentes. Logica de dominio pura: no conoce Postgres ni el
 * repositorio, solo opera sobre la lista de citas ya cargada.
 */
export function computeFreeSlots(confirmedAppointments: Appointment[], date: string): Slot[] {
  const slots: Slot[] = [];
  const slotMs = SLOT_DURATION_MINUTES * 60_000;
  const dayStart = new Date(`${date}T00:00:00.000Z`).getTime();
  const openMs = dayStart + CLINIC_OPEN_HOUR_UTC * 60 * 60_000;
  const closeMs = dayStart + CLINIC_CLOSE_HOUR_UTC * 60 * 60_000;

  for (let slotStart = openMs; slotStart + slotMs <= closeMs; slotStart += slotMs) {
    const slotEnd = slotStart + slotMs;
    const startDate = new Date(slotStart);
    const endDate = new Date(slotEnd);

    const isBusy = confirmedAppointments.some((appointment) => appointment.overlapsWith(startDate, endDate));
    if (!isBusy) {
      slots.push({ startTime: startDate.toISOString(), endTime: endDate.toISOString() });
    }
  }

  return slots;
}
