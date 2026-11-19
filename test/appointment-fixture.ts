import { randomUUID } from 'node:crypto';
import type { CreateAppointment } from '../src/modules/appointments/appointments.schemas.js';
export function appointmentFixture(
  patientId: string,
  updatedAt: string,
): CreateAppointment {
  const date = new Date(Date.now() + 3 * 86400000);
  date.setUTCHours(10, 0, 0, 0);
  return {
    patientId,
    patientUpdatedAt: updatedAt,
    clientRequestId: randomUUID(),
    startsAt: date.toISOString(),
    localStartsAt: date.toISOString().slice(0, 16),
    durationMinutes: 60,
    timeZone: 'UTC',
    reason: 'Cita ficticia',
    notes: 'No es una consulta',
  };
}
