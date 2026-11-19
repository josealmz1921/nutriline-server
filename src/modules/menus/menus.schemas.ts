import { z } from 'zod';
import { paginationShape } from '../../common/pagination.js';
export const menuMealIds = [
  'breakfast',
  'firstSnack',
  'lunch',
  'secondSnack',
  'dinner',
] as const;
const text = (max: number) => z.string().max(max);
const preparation = z
  .object({
    name: text(150),
    quantity: text(12),
    unit: text(40),
    instructions: text(1000),
    substitutions: text(1000),
  })
  .strict();
const meal = z
  .object({
    status: z.enum(['included', 'notIncluded']),
    time: text(5),
    preparations: z.array(preparation).max(50),
  })
  .strict();
export const menuCaptureSchema = z
  .object({
    date: z.iso
      .date()
      .refine((v) => v >= '1000-01-01', 'Fecha mínima 1000-01-01'),
    professional: text(100),
    recommendations: text(3000),
    nextReview: text(10),
    meals: z
      .object({
        breakfast: meal,
        firstSnack: meal,
        lunch: meal,
        secondSnack: meal,
        dinner: meal,
      })
      .strict(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const error = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (
      data.nextReview &&
      (!z.iso.date().safeParse(data.nextReview).success ||
        data.nextReview < data.date)
    )
      error(
        ['nextReview'],
        'La revisión debe ser una fecha válida igual o posterior al menú',
      );
    if (!menuMealIds.some((id) => data.meals[id].status === 'included'))
      error(['meals'], 'Incluye al menos un tiempo');
    for (const id of menuMealIds) {
      const m = data.meals[id];
      if (m.status !== 'included') continue;
      if (m.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time))
        error(['meals', id, 'time'], 'Horario HH:mm inválido');
      if (!m.preparations.length) error(['meals', id], 'Agrega preparaciones');
      for (const [i, row] of m.preparations.entries()) {
        if (
          !row.name.trim() ||
          !row.unit.trim() ||
          !/^\d+(?:[.,]\d+)?$/.test(row.quantity.trim()) ||
          !Number.isFinite(Number(row.quantity.trim().replace(',', '.'))) ||
          Number(row.quantity.trim().replace(',', '.')) <= 0
        )
          error(
            ['meals', id, 'preparations', i],
            'Nombre, cantidad positiva y unidad requeridos',
          );
      }
    }
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 80 * 1024)
      error([], 'El menú supera 80 KB; no se truncan capturas');
  });
const body = {
  schemaVersion: z.literal(1),
  clientRequestId: z.uuid(),
  patientUpdatedAt: z.iso.datetime({ offset: true }),
  menu: menuCaptureSchema,
};
export const createMenuSchema = z.object(body).strict();
export const editMenuSchema = z
  .object({
    ...body,
    expectedRevision: z.number().int().positive().max(1000000),
  })
  .strict();
export const menuParamsSchema = z.object({ menuId: z.uuid() }).strict();
export const revisionParamsSchema = z
  .object({
    menuId: z.uuid(),
    revision: z.coerce.number().int().positive().max(1000000),
  })
  .strict();
export const menuListSchema = z.object(paginationShape).strict();
export type CreateMenu = z.infer<typeof createMenuSchema>;
export type EditMenu = z.infer<typeof editMenuSchema>;
