import { z } from 'zod';
import { paginationShape } from '../../common/pagination.js';
export const appointmentStatuses = [
  'scheduled',
  'confirmed',
  'attended',
  'noShow',
  'cancelled',
] as const;
const instant = z.iso
  .datetime({ offset: true })
  .refine(
    (v) =>
      new Date(v).getUTCFullYear() >= 1000 &&
      /T\d\d:\d\d:00(?:\.000)?(?:Z|[+-]\d\d:\d\d)$/.test(v),
    'Usa instantes completos con precisión de minuto',
  );
const zone = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Zona horaria IANA inválida');
const schedule = {
  startsAt: instant,
  durationMinutes: z.number().int().min(5).max(480),
  timeZone: zone,
  localStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  reason: z.string().trim().min(1).max(500),
  notes: z.string().max(2000),
};
export const createAppointmentSchema = z
  .object({
    ...schedule,
    patientId: z.uuid(),
    patientUpdatedAt: z.iso.datetime({ offset: true }),
    clientRequestId: z.uuid(),
  })
  .strict();
export const rescheduleAppointmentSchema = z
  .object({
    ...schedule,
    expectedVersion: z.number().int().positive().max(1000000),
    clientRequestId: z.uuid(),
  })
  .strict();
export const statusAppointmentSchema = z
  .object({
    status: z.enum(['confirmed', 'attended', 'noShow', 'cancelled']),
    expectedVersion: z.number().int().positive().max(1000000),
    clientRequestId: z.uuid(),
  })
  .strict();
export const appointmentParamsSchema = z
  .object({ appointmentId: z.uuid() })
  .strict();
export const listAppointmentsSchema = z
  .object({
    ...paginationShape,
    from: instant,
    to: instant,
    status: z.enum(appointmentStatuses).optional(),
    search: z.string().trim().max(150).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    const span = Date.parse(v.to) - Date.parse(v.from);
    if (span <= 0 || span > 63 * 86400000)
      c.addIssue({
        code: 'custom',
        message: 'Usa un intervalo mayor que cero y de hasta 63 días',
        path: ['to'],
      });
  });
export type CreateAppointment = z.infer<typeof createAppointmentSchema>;
export type RescheduleAppointment = z.infer<typeof rescheduleAppointmentSchema>;
export type StatusAppointment = z.infer<typeof statusAppointmentSchema>;
export type ListAppointments = z.infer<typeof listAppointmentsSchema>;
export function localMinute(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function scheduleError(
  input: Pick<
    RescheduleAppointment,
    'startsAt' | 'durationMinutes' | 'timeZone' | 'localStartsAt'
  >,
  now = new Date(),
): string | null {
  const start = new Date(input.startsAt),
    end = new Date(start.getTime() + input.durationMinutes * 60000);
  if (start <= now) return 'La cita debe comenzar en el futuro';
  if (localMinute(start, input.timeZone) !== input.localStartsAt)
    return 'El horario local no corresponde al instante y zona declarados';
  if (
    localMinute(end, input.timeZone).slice(0, 10) !==
    input.localStartsAt.slice(0, 10)
  )
    return 'La cita debe terminar el mismo día de captura';
  // Reject both occurrences of a repeated DST minute; never silently choose one.
  for (let delta = -180; delta <= 180; delta += 15)
    if (
      delta !== 0 &&
      localMinute(new Date(start.getTime() + delta * 60000), input.timeZone) ===
        input.localStartsAt
    )
      return 'Horario ambiguo por cambio de zona; selecciona otra hora';
  return null;
}
