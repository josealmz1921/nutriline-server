import { z } from 'zod';
import { paginationShape } from '../../common/pagination.js';
import { legacyFoodRows } from '../foods/legacy-foods.data.js';
import { foodCatalogVersion } from '../foods/foods.service.js';
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
const dynamicMeal = meal.extend({
  label: text(100).refine((value) => Boolean(value.trim()), 'Nombre requerido'),
});
const mealKey = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,64}$/)
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
  );
const capture = z
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
  .strict();
const dynamicCapture = capture.extend({
  meals: z
    .record(mealKey, dynamicMeal)
    .refine(
      (value) =>
        Object.keys(value).length >= 1 && Object.keys(value).length <= 20,
      'Usa entre 1 y 20 tiempos',
    ),
});
const foodNames = new Map(
  legacyFoodRows.map((food) => [food.idAlimento, food.Alimento]),
);
const ingredient = z
  .object({
    catalogId: z.string().regex(/^\d+$/),
    catalogVersion: z.literal(foodCatalogVersion),
    name: text(150),
    quantity: text(12),
    unit: text(40),
  })
  .strict()
  .refine(
    (row) => foodNames.get(row.catalogId) === row.name,
    'Referencia de alimento no reconocida',
  );
const ingredientPreparation = preparation.extend({
  ingredients: z.array(ingredient).max(50).optional(),
});
const ingredientCapture = dynamicCapture.extend({
  meals: z
    .record(
      mealKey,
      dynamicMeal.extend({
        preparations: z.array(ingredientPreparation).max(50),
      }),
    )
    .refine(
      (value) =>
        Object.keys(value).length >= 1 && Object.keys(value).length <= 20,
      'Usa entre 1 y 20 tiempos',
    ),
});
function validateCapture(
  data:
    | z.infer<typeof capture>
    | z.infer<typeof dynamicCapture>
    | z.infer<typeof ingredientCapture>,
  ctx: z.RefinementCtx,
) {
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
  if (!Object.values(data.meals).some((meal) => meal.status === 'included'))
    error(['meals'], 'Incluye al menos un tiempo');
  for (const [id, m] of Object.entries(data.meals)) {
    if (m.status !== 'included') continue;
    if (m.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time))
      error(['meals', id, 'time'], 'Horario HH:mm inválido');
    if (!m.preparations.length) error(['meals', id], 'Agrega preparaciones');
    for (const [i, row] of m.preparations.entries()) {
      if ('ingredients' in row && row.ingredients) {
        for (const [j, item] of (
          (row as z.infer<typeof ingredientPreparation>).ingredients ?? []
        ).entries()) {
          if (
            !item.unit.trim() ||
            !/^\d+(?:[.,]\d+)?$/.test(item.quantity.trim()) ||
            !Number.isFinite(Number(item.quantity.replace(',', '.'))) ||
            Number(item.quantity.replace(',', '.')) <= 0
          )
            error(
              ['meals', id, 'preparations', i, 'ingredients', j],
              'Cantidad positiva y unidad requeridas para el ingrediente',
            );
        }
      }
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
}
const legacyCaptureSchema = capture.superRefine(validateCapture);
const dynamicCaptureSchema = dynamicCapture.superRefine(validateCapture);
const ingredientCaptureSchema = ingredientCapture.superRefine(validateCapture);
export const menuCaptureSchema = z.union([
  legacyCaptureSchema,
  dynamicCaptureSchema,
  ingredientCaptureSchema,
]);
const body = {
  clientRequestId: z.uuid(),
  patientUpdatedAt: z.iso.datetime({ offset: true }),
};
const legacyBody = z
  .object({ ...body, schemaVersion: z.literal(1), menu: legacyCaptureSchema })
  .strict();
const dynamicBody = z
  .object({ ...body, schemaVersion: z.literal(2), menu: dynamicCaptureSchema })
  .strict();
const ingredientBody = z
  .object({
    ...body,
    schemaVersion: z.literal(3),
    menu: ingredientCaptureSchema,
  })
  .strict();
export const createMenuSchema = z.discriminatedUnion('schemaVersion', [
  legacyBody,
  dynamicBody,
  ingredientBody,
]);
const revision = { expectedRevision: z.number().int().positive().max(1000000) };
export const editMenuSchema = z.discriminatedUnion('schemaVersion', [
  legacyBody.extend(revision),
  dynamicBody.extend(revision),
  ingredientBody.extend(revision),
]);
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
