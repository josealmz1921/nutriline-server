import { z } from 'zod';

// Versioned capture, not a clinical approval. Excluded drafts retain their text.
const text = (max = 300) => z.string().max(max).nullable().optional();
const availability = z.enum(['captured', 'notPerformed', 'unavailable']);
const optionalChoice = (values: readonly string[]) =>
  z
    .enum(['', ...values])
    .nullable()
    .optional();
export const assessmentMeasurementIds = [
  'height',
  'weight',
  'waist',
  'hip',
  'wrist',
  'biceps',
  'triceps',
  'subscapular',
  'suprailiac',
  'abdominalFold',
  'iliacCrest',
  'pectoral',
  'thighFold',
  'calfFold',
  'flexedArm',
  'shoulders',
  'chest',
  'abdomen',
  'relaxedArm',
  'forearmGirth',
  'calfGirth',
  'ankle',
  'biacromial',
  'biiliocrestal',
  'transverseChest',
  'apChest',
  'humerus',
  'wristBreadth',
  'femur',
  'ankleBreadth',
  'armLength',
  'forearmLength',
  'handLength',
  'trochanterHeight',
  'tibialHeight',
  'thighLength',
  'legLength',
  'footLength',
  'supraspinale',
] as const;
const measurements = z
  .object({
    measurementAvailability: availability,
    measurementState: optionalChoice([
      'fasting',
      'postprandial',
      'postTraining',
    ]),
    ...(Object.fromEntries(
      assessmentMeasurementIds.map((id) => [id, text(24)]),
    ) as Record<
      (typeof assessmentMeasurementIds)[number],
      ReturnType<typeof text>
    >),
  })
  .strict();
export const assessmentLabIds = [
  'glucose',
  'uricAcid',
  'albumin',
  'creatinine',
  'ferritin',
  'globulin',
  'prealbumin',
  'totalProtein',
  'transferrin',
  'urea',
] as const;
const labResult = z
  .object({
    value: text(24),
    unit: text(40),
    reference: text(150),
    interpretation: text(500),
  })
  .strict();
const biochemistry = z
  .object({
    availability: availability.or(z.literal('')).nullable().optional(),
    collectedOn: text(24),
    laboratory: text(150),
    results: z.partialRecord(z.enum(assessmentLabIds), labResult).optional(),
  })
  .strict();
export const assessmentMealIds = [
  'breakfast',
  'firstSnack',
  'lunch',
  'secondSnack',
  'dinner',
] as const;
const food = z
  .object({
    name: text(150),
    quantity: text(24),
    unit: text(40),
    catalogId: text(100),
  })
  .strict();
const preparation = z
  .object({ name: text(150), foods: z.array(food).max(100).optional() })
  .strict();
const meal = z
  .object({
    status: optionalChoice([
      'pending',
      'captured',
      'notConsumed',
      'unavailable',
    ]),
    preparations: z.array(preparation).max(50).optional(),
  })
  .strict();
const recall = z
  .object({
    availability,
    meals: z.partialRecord(z.enum(assessmentMealIds), meal).optional(),
  })
  .strict();
const activity = z
  .object({
    name: text(300),
    duration: text(24),
    unit: text(24),
    met: text(24),
    source: text(300),
  })
  .strict();
const habits = z
  .object({
    availability,
    preferred: text(2000),
    disliked: text(2000),
    mealsPerDay: text(24),
    minutesPerMeal: text(24),
    waterGlasses: text(24),
    sleepHours: text(24),
    activityStatus: optionalChoice(['captured', 'none', 'unavailable']),
    activityLevel: optionalChoice([
      'sedentary',
      'light',
      'moderate',
      'strong',
      'veryStrong',
    ]),
    activities: z.array(activity).max(100).optional(),
  })
  .strict();
const formulas = z
  .object({
    availability,
    referenceDate: text(24),
    sex: optionalChoice(['male', 'female']),
    population: optionalChoice(['generalAdult', 'other']),
    metabolicAuthor: optionalChoice([
      'valencia',
      'mifflin',
      'schofield',
      'harris',
      'fao',
      'iom',
    ]),
    exercise: optionalChoice(['1.2', '1.375', '1.55', '1.725', '1.9', 'mets']),
    stress: optionalChoice([
      'none',
      ...Array.from({ length: 12 }, (_, index) => `legacy-${index}`),
    ]),
    fatAuthor: optionalChoice([
      'deurenberg',
      'garrow',
      'lean',
      'durnin',
      'brozek',
      'faulkner',
      'yuhasz',
    ]),
    densityAuthor: optionalChoice(['durnin']),
    boneAuthor: optionalChoice(['rocha']),
    residualAuthor: optionalChoice(['wurch']),
    muscleAuthor: optionalChoice(['remainder']),
    fatInterpretation: text(2000),
    bmiInterpretation: text(2000),
  })
  .strict();
export const assessmentFormulaResultIds = [
  'bmr',
  'exercise',
  'stress',
  'expenditure',
  'consumption',
  'balance',
  'fat',
  'fatKg',
  'density',
  'bone',
  'residual',
  'muscle',
  'bmi',
] as const;
export const assessmentNutrientIds = [
  'energiaKcal',
  'energiaKJ',
  'proteinag',
  'lipidosg',
  'HidratCarbg',
  'fibrag',
  'vitaminAbugRE',
  'AcidoAscorbicomg',
  'AcidoFolicomg',
  'hierroNOEMmg',
  'calciomg',
  'hierromg',
  'sodiomg',
  'potasiomg',
  'azucarg',
  'azucar',
  'indiceglicemico',
  'cargaglicemica',
  'colesterol',
  'selenio',
  'AGSaturadosg',
  'AGMonog',
  'AGPolig',
  'Eanol',
] as const;
export const assessmentAnthropometryIds = [
  'bmi',
  'waistHip',
  'waistHeight',
  'endomorphy',
  'mesomorphy',
  'ectomorphy',
  'pointX',
  'pointY',
] as const;
const result = z
  .object({
    group: z.enum(['anthropometry', 'formulas', 'recall', 'activities']),
    id: z.string().min(1).max(100),
    label: z.string().min(1).max(300),
    unit: z.string().max(40),
    value: z.number().finite().nullable(),
    subtotal: z.number().finite().nullable().optional(),
    detail: z.string().max(4000),
  })
  .strict();
const instant = z.iso.datetime({ offset: true });
export const assessmentSchema = z
  .object({
    schemaVersion: z.literal(1),
    engineVersion: z.literal('nutriline-client-assessment-1'),
    resultsOrigin: z.literal('client-snapshot'),
    clinicalApproval: z.literal(false),
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Zona horaria inválida'),
    measuredAt: instant.nullable(),
    localTimes: z
      .object({
        occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        measuredAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
          .nullable(),
      })
      .strict(),
    symptoms: z
      .array(
        z.enum([
          'Pérdida de peso',
          'Ganancia de peso',
          'Fiebre',
          'Debilidad',
          'Dolor articular',
          'Diarrea',
          'Estreñimiento',
          'Distensión abdominal',
          'Edema',
          'Tumoraciones',
          'Otros',
          'Poliuria',
          'Nicturia',
          'Polaquiuria',
          'Tenesmo',
          'Cefalea',
          'Náuseas',
          'Vómito',
        ]),
      )
      .max(18)
      .refine((items) => new Set(items).size === items.length),
    captures: z
      .object({
        anthropometry: measurements,
        biochemistry,
        recall,
        habits,
        formulas,
      })
      .strict(),
    results: z.array(result).max(512),
  })
  .strict()
  .superRefine((data, ctx) => {
    const error = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const active = (value: { availability?: string | null }) =>
      !['notPerformed', 'unavailable'].includes(String(value.availability));
    const clean = (value: unknown) =>
      typeof value === 'string' ? value.trim() : '';
    const numeric = (value: unknown, allowZero = false) => {
      const raw = clean(value).replace(',', '.');
      const number = Number(raw);
      return (
        /^\d+(?:\.\d+)?$/.test(raw) &&
        Number.isFinite(number) &&
        (allowZero ? number >= 0 : number > 0)
      );
    };
    const c = data.captures;
    if (c.anthropometry.measurementAvailability === 'captured') {
      if (!data.measuredAt || !data.localTimes.measuredAt)
        error(
          ['measuredAt'],
          'Fecha de medición requerida cuando hay mediciones',
        );
      for (const id of assessmentMeasurementIds) {
        const value = c.anthropometry[id];
        if (
          (clean(value) || ['weight', 'height'].includes(id)) &&
          !numeric(value)
        )
          error(
            ['captures', 'anthropometry', id],
            'Medida positiva requerida, sin unidades ni exponentes',
          );
      }
    }
    if (active(c.biochemistry)) {
      if (
        !Object.values(c.biochemistry.results ?? {}).some((row) =>
          clean(row.value),
        )
      )
        error(
          ['captures', 'biochemistry'],
          'Captura un valor o declara el estudio no realizado/no disponible',
        );
      for (const [id, row] of Object.entries(c.biochemistry.results ?? {})) {
        if (clean(row.value) && (!numeric(row.value, true) || !clean(row.unit)))
          error(
            ['captures', 'biochemistry', 'results', id],
            'Valor no negativo y unidad requeridos',
          );
      }
      if (
        clean(c.biochemistry.collectedOn) &&
        !z.iso.date().safeParse(c.biochemistry.collectedOn).success
      )
        error(['captures', 'biochemistry', 'collectedOn'], 'Fecha inválida');
    }
    if (c.recall.availability === 'captured') {
      for (const id of assessmentMealIds) {
        const row = c.recall.meals?.[id];
        if (
          !row ||
          !['captured', 'notConsumed', 'unavailable'].includes(
            String(row.status),
          )
        )
          error(
            ['captures', 'recall', 'meals', id],
            'Declara cada tiempo del R24',
          );
        if (row?.status === 'captured') {
          if (!row.preparations?.length)
            error(['captures', 'recall', 'meals', id], 'Agrega preparaciones');
          for (const prep of row.preparations ?? []) {
            if (
              !clean(prep.name) ||
              !prep.foods?.length ||
              prep.foods.some(
                (item) =>
                  !clean(item.name) ||
                  !clean(item.unit) ||
                  !numeric(item.quantity),
              )
            )
              error(
                ['captures', 'recall', 'meals', id],
                'Preparaciones y alimentos completos requeridos',
              );
          }
        }
      }
    }
    if (c.habits.availability === 'captured') {
      if (
        !['captured', 'none', 'unavailable'].includes(
          String(c.habits.activityStatus),
        )
      )
        error(
          ['captures', 'habits', 'activityStatus'],
          'Declara la disponibilidad de actividad',
        );
      for (const [id, max, integer] of [
        ['mealsPerDay', 100, true],
        ['minutesPerMeal', 1440, false],
        ['waterGlasses', 1000, false],
        ['sleepHours', 24, false],
      ] as const) {
        const value = c.habits[id];
        const number = Number(clean(value).replace(',', '.'));
        if (
          clean(value) &&
          (!numeric(value, true) ||
            number > max ||
            (integer && !Number.isInteger(number)))
        )
          error(
            ['captures', 'habits', id],
            'Dato de hábitos fuera de rango técnico',
          );
      }
      if (
        !clean(c.habits.preferred) &&
        !clean(c.habits.disliked) &&
        !['mealsPerDay', 'minutesPerMeal', 'waterGlasses', 'sleepHours'].some(
          (key) => clean(c.habits[key as keyof typeof c.habits]),
        ) &&
        c.habits.activityStatus === 'unavailable'
      )
        error(
          ['captures', 'habits'],
          'Captura entrevista o declara hábitos no disponibles',
        );
      if (c.habits.activityStatus === 'captured') {
        let total = 0;
        if (!c.habits.activities?.length)
          error(['captures', 'habits', 'activities'], 'Agrega actividades');
        for (const row of c.habits.activities ?? []) {
          const duration = Number(clean(row.duration).replace(',', '.'));
          if (
            !clean(row.name) ||
            !numeric(row.duration) ||
            !['minutes', 'hours'].includes(String(row.unit)) ||
            duration > 1440 ||
            (clean(row.met) &&
              (!numeric(row.met) ||
                Number(clean(row.met).replace(',', '.')) > 100))
          )
            error(['captures', 'habits', 'activities'], 'Actividad inválida');
          total += duration * (row.unit === 'hours' ? 60 : 1);
        }
        if (total > 1440)
          error(
            ['captures', 'habits', 'activities'],
            'Las actividades superan 24 horas',
          );
      }
    }
    if (
      c.formulas.availability === 'captured' &&
      !z.iso.date().safeParse(c.formulas.referenceDate).success
    )
      error(
        ['captures', 'formulas', 'referenceDate'],
        'Fecha de referencia requerida',
      );
    const required = {
      anthropometry: assessmentAnthropometryIds,
      formulas: assessmentFormulaResultIds,
      recall: assessmentNutrientIds,
      activities: ['metMinutes', 'kcal'],
    };
    const seen = new Set<string>();
    for (const [index, row] of data.results.entries()) {
      const key = `${row.group}:${row.id}`;
      if (
        seen.has(key) ||
        !(required[row.group] as readonly string[]).includes(row.id)
      )
        error(['results', index], 'Resultado desconocido o duplicado');
      seen.add(key);
      const excluded =
        row.group === 'anthropometry'
          ? c.anthropometry.measurementAvailability !== 'captured'
          : row.group === 'activities'
            ? c.habits.availability !== 'captured' ||
              c.habits.activityStatus === 'unavailable'
            : row.group === 'formulas'
              ? c.formulas.availability !== 'captured'
              : c.recall.availability !== 'captured';
      if (excluded && (row.value !== null || row.subtotal != null))
        error(
          ['results', index],
          'Un borrador excluido no puede aportar resultados',
        );
    }
    for (const [group, ids] of Object.entries(required))
      for (const id of ids)
        if (!seen.has(`${group}:${id}`))
          error(['results'], `Falta estado del resultado ${group}:${id}`);
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 80 * 1024)
      error([], 'La evaluación supera el límite técnico de 80 KB');
  });
export type AssessmentInput = z.infer<typeof assessmentSchema>;
