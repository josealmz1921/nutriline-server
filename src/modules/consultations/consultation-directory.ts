import type { Prisma } from '../../generated/prisma/client.js';
import type { ConsultationDirectoryQuery } from './consultations.schemas.js';

const calendar = new Intl.DateTimeFormat('en', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
// Find the first instant of a local day (or the next one), including historical
// DST/offset changes. No fixed UTC-6 assumption and no dependence on server TZ.
export function directoryDayBoundary(day: string, after = false): Date {
  const target = Number(day.replaceAll('-', ''));
  const utc = Date.parse(`${day}T00:00:00.000Z`);
  let low = utc - 2 * 86400000,
    high = utc + 2 * 86400000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const parts = calendar.formatToParts(new Date(middle));
    const part = (type: string) =>
      Number(parts.find((p) => p.type === type)!.value);
    const value = part('year') * 10000 + part('month') * 100 + part('day');
    if (after ? value <= target : value < target) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}

export function directoryWhere(
  nutritionistId: string,
  query: ConsultationDirectoryQuery,
): Prisma.ConsultationWhereInput {
  const search = query.search?.replace(/[\\%_]/g, '\\$&');
  return {
    nutritionistId,
    patient: {
      nutritionistId,
      ...(query.status === 'all'
        ? {}
        : { archivedAt: query.status === 'active' ? null : { not: null } }),
    },
    ...(search
      ? {
          OR: [
            { reason: { contains: search } },
            { id: { contains: search } },
            { patientId: { contains: search } },
            { patient: { fullName: { contains: search } } },
          ],
        }
      : {}),
    ...(query.fromDate || query.toDate
      ? {
          occurredAt: {
            ...(query.fromDate
              ? { gte: directoryDayBoundary(query.fromDate) }
              : {}),
            // MySQL cannot store a year-10000 instant; the last local day
            // already includes all remaining representable UTC timestamps.
            ...(query.toDate && query.toDate !== '9999-12-31'
              ? { lt: directoryDayBoundary(query.toDate, true) }
              : {}),
          },
        }
      : {}),
  };
}
