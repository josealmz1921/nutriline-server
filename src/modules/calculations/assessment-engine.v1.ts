import { createHash } from 'node:crypto';
import type { AssessmentInput } from '../consultations/assessment.schemas.js';
import { assessmentMealIds } from '../consultations/assessment.schemas.js';
import {
  foodReferences,
  nutrientDefinitions,
} from './assessment-catalog.v1.js';

type Captures = AssessmentInput['captures'];
type Group = 'anthropometry' | 'formulas' | 'recall' | 'activities';
export type ServerResult = {
  group: Group;
  id: string;
  label: string;
  unit: string;
  value: number | null;
  detail: string;
  methodCode: string;
  methodVersion: '1';
  status: 'calculated' | 'excluded' | 'unavailable';
  subtotal?: number | null;
};
const clean = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
export function positiveDecimal(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(',', '.');
  const n = Number(text);
  return /^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(n) && n > 0 ? n : null;
}
const finite = (n: number | null) =>
  n !== null && Number.isFinite(n) ? n : null;
const positive = (n: number | null) => (n !== null && n > 0 ? finite(n) : null);
const percentage = (n: number | null) =>
  n !== null && n > 0 && n < 100 ? finite(n) : null;
const rating = (n: number) => (Number.isFinite(n) && n <= 0 ? 0.1 : n);
function row(
  group: Group,
  id: string,
  label: string,
  unit: string,
  value: number | null,
  detail: string,
  active = true,
): ServerResult {
  const result = active ? finite(value) : null;
  return {
    group,
    id,
    label,
    unit,
    value: result,
    detail: active
      ? detail
      : 'Sección excluida por declaración explícita. El borrador no participa.',
    methodCode: `${group}:${id}`,
    methodVersion: '1',
    status: !active
      ? 'excluded'
      : result === null
        ? 'unavailable'
        : 'calculated',
  };
}
function anthropometry(c: Captures) {
  const active = c.anthropometry.measurementAvailability === 'captured';
  const m = (key: keyof Captures['anthropometry']) =>
    active ? positiveDecimal(c.anthropometry[key]) : null;
  const evaluate = (
    id: string,
    label: string,
    unit: string,
    keys: (keyof Captures['anthropometry'])[],
    equation: (...n: number[]) => number,
    detail: string,
  ) => {
    const missing = keys.filter((key) => m(key) === null);
    return row(
      'anthropometry',
      id,
      label,
      unit,
      missing.length ? null : equation(...keys.map((key) => m(key)!)),
      missing.length
        ? `Faltan medidas: ${missing.join(', ')}.`
        : `${detail} Un resultado no finito queda sin resultado; no es clasificación clínica.`,
      active,
    );
  };
  const rows = [
    evaluate(
      'bmi',
      'IMC numérico',
      'kg/m²',
      ['weight', 'height'],
      (w, h) => w / (h / 100) ** 2,
      'Peso(kg)/talla(m)².',
    ),
    evaluate(
      'waistHip',
      'Índice cintura/cadera',
      '',
      ['waist', 'hip'],
      (w, h) => w / h,
      'Cintura/cadera, ambas en cm.',
    ),
    evaluate(
      'waistHeight',
      'Índice cintura/talla',
      '',
      ['waist', 'height'],
      (w, h) => w / h,
      'Cintura/talla, ambas en cm.',
    ),
    evaluate(
      'endomorphy',
      'Endomorfia',
      '',
      ['height', 'triceps', 'subscapular', 'supraspinale'],
      (h, t, s, p) => {
        const x = ((t + s + p) * 170.18) / h;
        return rating(
          -0.7182 + 0.1451 * x - 0.00068 * x ** 2 + 0.0000014 * x ** 3,
        );
      },
      'Heath–Carter (2002). X=(tríceps+subescapular+supraespinal en mm)×170.18/talla(cm); −0.7182+0.1451X−0.00068X²+0.0000014X³. No se sustituye supraespinal por suprailíaco; componente ≤0 se expresa como 0.1.',
    ),
    evaluate(
      'mesomorphy',
      'Mesomorfia',
      '',
      [
        'height',
        'humerus',
        'femur',
        'flexedArm',
        'triceps',
        'calfGirth',
        'calfFold',
      ],
      (h, hu, f, a, t, ca, cf) => {
        const arm = a - t / 10,
          calf = ca - cf / 10;
        return arm > 0 && calf > 0
          ? rating(
              0.858 * hu +
                0.601 * f +
                0.188 * arm +
                0.161 * calf -
                0.131 * h +
                4.5,
            )
          : NaN;
      },
      'Heath–Carter (2002): 0.858×húmero+0.601×fémur+0.188×brazo corregido+0.161×pierna corregida−0.131×talla+4.5. cm; perímetros menos pliegue(mm)/10 deben ser positivos. Componente ≤0 se expresa como 0.1.',
    ),
    evaluate(
      'ectomorphy',
      'Ectomorfia',
      '',
      ['height', 'weight'],
      (h, w) => {
        const r = h / Math.cbrt(w);
        return r >= 40.75
          ? 0.732 * r - 28.58
          : r > 38.25
            ? 0.463 * r - 17.63
            : 0.1;
      },
      'Heath–Carter (2002): R=talla(cm)/∛peso(kg). R≥40.75: 0.732R−28.58; 38.25<R<40.75: 0.463R−17.63; R≤38.25: 0.1.',
    ),
  ];
  const [endo, meso, ecto] = rows.slice(3).map((item) => item.value);
  const complete = endo !== null && meso !== null && ecto !== null;
  rows.push(
    row(
      'anthropometry',
      'pointX',
      'Somatotipo · X',
      '',
      complete ? ecto! - endo! : null,
      'Ectomorfia−endomorfia, sin redondeo intermedio ni zonas clínicas.',
      active,
    ),
    row(
      'anthropometry',
      'pointY',
      'Somatotipo · Y',
      '',
      complete ? 2 * meso! - endo! - ecto! : null,
      '2×mesomorfia−endomorfia−ectomorfia. Requiere las tres componentes.',
      active,
    ),
  );
  return rows;
}
function recall(c: Captures) {
  const data = c.recall,
    active = data.availability === 'captured';
  const meals = assessmentMealIds.map((id) => data.meals?.[id]);
  const foods = meals.flatMap((meal) =>
    meal?.status === 'captured'
      ? (meal.preparations ?? []).flatMap((prep) => prep.foods ?? [])
      : [],
  );
  const unknown = meals.filter(
    (meal) =>
      !meal ||
      !['captured', 'notConsumed'].includes(String(meal.status)) ||
      (meal.status === 'captured' &&
        (!meal.preparations?.length ||
          meal.preparations.some((prep) => !prep.foods?.length))),
  ).length;
  const references = foods.map((food) => {
    const ref = foodReferences.find((item) => item.id === food.catalogId),
      quantity = positiveDecimal(food.quantity);
    return ref &&
      quantity !== null &&
      clean(food.quantity).length <= 12 &&
      clean(food.name) === ref.name &&
      clean(food.unit) === ref.unit
      ? { ref, factor: quantity / ref.quantity }
      : null;
  });
  return nutrientDefinitions.map(([id, label, unit, additive], index) => {
    const values = references.map((item) =>
      item ? finite(item.ref.values[index] * item.factor) : null,
    );
    const count = values.filter((n) => n !== null).length;
    const sum = values.reduce<number>((total, n) => total + (n ?? 0), 0);
    const subtotal =
      active && additive && (count > 0 || (unknown === 0 && foods.length === 0))
        ? finite(sum)
        : null;
    const value = unknown === 0 && count === foods.length ? subtotal : null;
    return {
      ...row(
        'recall',
        id,
        label,
        unit,
        value,
        `${count}/${foods.length} alimentos con referencia exacta; ${unknown} tiempos sin información completa. ${additive ? 'Catálogo histórico de seis alimentos. Un subtotal no equivale al consumo completo; alimentos libres o referencia/unidad/nombre no coincidentes no aportan nutrientes.' : 'Columna histórica no sumable: falta verificar unidad o método.'}`,
        active,
      ),
      subtotal,
    };
  });
}
function activities(c: Captures) {
  const h = c.habits,
    active = h.availability === 'captured';
  const none = active && h.activityStatus === 'none';
  const weight =
    c.anthropometry.measurementAvailability === 'captured'
      ? positiveDecimal(c.anthropometry.weight)
      : null;
  const rows = (h.activities ?? []).map((item) => {
    const d = positiveDecimal(item.duration),
      met = positiveDecimal(item.met);
    const minutes =
      d !== null && ['minutes', 'hours'].includes(String(item.unit))
        ? d * (item.unit === 'hours' ? 60 : 1)
        : null;
    return {
      minutes,
      metMinutes:
        minutes !== null && met !== null && clean(item.source)
          ? finite(minutes * met)
          : null,
    };
  });
  const complete =
    active &&
    h.activityStatus === 'captured' &&
    rows.length > 0 &&
    rows.every((item) => item.metMinutes !== null) &&
    rows.reduce((sum, item) => sum + (item.minutes ?? 0), 0) <= 1440;
  const met = none
    ? 0
    : complete
      ? finite(rows.reduce((sum, item) => sum + item.metMinutes!, 0))
      : null;
  const kcal = none
    ? 0
    : complete && weight !== null
      ? finite(
          rows.reduce(
            (sum, item) => sum + item.metMinutes! * 0.0175 * weight,
            0,
          ),
        )
      : null;
  const included =
    active && ['none', 'captured'].includes(String(h.activityStatus));
  return [
    row(
      'activities',
      'metMinutes',
      'MET·min declarados',
      'MET·min',
      met,
      'Suma duración(min)×MET, solo si cada actividad tiene fuente/MET, y duración total ≤24 h. Cero solo con ninguna actividad declarada.',
      included,
    ),
    row(
      'activities',
      'kcal',
      'Energía bruta de actividades',
      'kcal',
      kcal,
      'MET×0.0175×peso(kg)×min. Requiere peso disponible. No es gasto diario/neto ni se añade automáticamente a TMB.',
      included,
    ),
  ];
}
export function ageAtDate(birth: string, date: string): number | null {
  const valid = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(`${v}T12:00:00Z`)) &&
    new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
  return valid(birth) && valid(date) && date >= birth
    ? Number(date.slice(0, 4)) -
        Number(birth.slice(0, 4)) -
        (date.slice(5) < birth.slice(5) ? 1 : 0)
    : null;
}
export function durninDensity(
  age: number,
  sex: string,
  folds: number[],
): number | null {
  if (
    age < 18 ||
    age > 72 ||
    !['male', 'female'].includes(sex) ||
    folds.length !== 4 ||
    folds.some((n) => !Number.isFinite(n) || n <= 0)
  )
    return null;
  const index = age < 20 ? 0 : age < 30 ? 1 : age < 40 ? 2 : age < 50 ? 3 : 4;
  const table =
    sex === 'male'
      ? [
          [1.162, 0.063],
          [1.1631, 0.0632],
          [1.1422, 0.0544],
          [1.162, 0.07],
          [1.1715, 0.0779],
        ]
      : [
          [1.1549, 0.0678],
          [1.1599, 0.0717],
          [1.1423, 0.0632],
          [1.1333, 0.0612],
          [1.1339, 0.0645],
        ];
  const [a, b] = table[index];
  return positive(a - b * Math.log10(folds.reduce((sum, n) => sum + n, 0)));
}
function formulas(
  c: Captures,
  birthDate: string,
  recallRows: ServerResult[],
  activityRows: ServerResult[],
) {
  const f = c.formulas,
    active = f.availability === 'captured';
  const measure = (key: keyof Captures['anthropometry']) =>
    c.anthropometry.measurementAvailability === 'captured'
      ? positiveDecimal(c.anthropometry[key])
      : null;
  const w = measure('weight'),
    h = measure('height'),
    waist = measure('waist');
  const age = ageAtDate(birthDate, clean(f.referenceDate));
  const eligible =
    active &&
    f.population === 'generalAdult' &&
    ['male', 'female'].includes(String(f.sex)) &&
    age !== null &&
    age >= 18 &&
    age <= 120;
  const bmi = w !== null && h !== null ? positive(w / (h / 100) ** 2) : null;
  let bmr: number | null = null;
  let bmrDetail =
    'Selecciona método y dependencias. Valencia 2008 e IOM 2005 permanecen sin resultado: fuente/protocolo pendientes; IOM es EER, no TMB.';
  if (eligible && w !== null && age !== null) {
    if (f.metabolicAuthor === 'mifflin') {
      bmrDetail =
        'Mifflin-St Jeor simplificada: 10×kg+6.25×cm−5×años+(5 masculino/−161 femenino). Alcance 19–78 años.';
      if (h !== null && age >= 19 && age <= 78)
        bmr = positive(
          10 * w + 6.25 * h - 5 * age + (f.sex === 'male' ? 5 : -161),
        );
    }
    if (f.metabolicAuthor === 'harris') {
      bmrDetail =
        'Harris-Benedict original, no 1984. Masculino: 66.473+13.752×kg+5.003×cm−6.755×años. Femenino: 655.096+9.563×kg+1.850×cm−4.676×años.';
      if (h !== null)
        bmr = positive(
          f.sex === 'male'
            ? 66.473 + 13.752 * w + 5.003 * h - 6.755 * age
            : 655.096 + 9.563 * w + 1.85 * h - 4.676 * age,
        );
    }
    if (['schofield', 'fao'].includes(String(f.metabolicAuthor))) {
      const i = age < 30 ? 0 : age < 60 ? 1 : 2;
      const [a, b] = (
        f.sex === 'male'
          ? [
              [15.057, 692.2],
              [11.472, 873.1],
              [11.711, 587.7],
            ]
          : [
              [14.818, 486.6],
              [8.126, 845.6],
              [9.082, 658.5],
            ]
      )[i];
      bmr = positive(a * w + b);
      bmrDetail = `Schofield, tabla 5.2 FAO: ${a}×peso(kg)+${b}. Bandas 18–<30, 30–<60, ≥60. FAO no es un método independiente.`;
    }
  }
  const pal = ['1.2', '1.375', '1.55', '1.725', '1.9'].includes(
    String(f.exercise),
  )
    ? Number(f.exercise)
    : null;
  const exercise =
    eligible && f.exercise === 'mets'
      ? activityRows.find((r) => r.id === 'kcal')!.value
      : bmr !== null && pal !== null
        ? bmr * (pal - 1)
        : null;
  const stress = bmr !== null && f.stress === 'none' ? 0 : null;
  const expenditure =
    bmr !== null && pal !== null && stress !== null
      ? positive(bmr * pal)
      : null;
  const consumption = active
    ? recallRows.find((r) => r.id === 'energiaKcal')!.value
    : null;
  const balance =
    consumption !== null && expenditure !== null
      ? consumption - expenditure
      : null;
  const folds = ['biceps', 'triceps', 'subscapular', 'suprailiac'].map((key) =>
    measure(key as keyof Captures['anthropometry']),
  );
  const density =
    eligible && age !== null && folds.every((n) => n !== null)
      ? durninDensity(age, String(f.sex), folds as number[])
      : null;
  let fat: number | null = null;
  let fatDetail =
    'Requiere población adulta general, sexo de ecuación, método y dependencias. Garrow/Faulkner/Yuhasz pendientes de protocolo/población; sin extrapolar.';
  if (eligible && age !== null) {
    if (f.fatAuthor === 'deurenberg') {
      fatDetail =
        'Deurenberg: 1.20×IMC+0.23×edad−10.8×sexo−5.4 (masculino=1/femenino=0). Solo 0<grasa<100; no se recorta.';
      if (bmi !== null)
        fat = percentage(
          1.2 * bmi + 0.23 * age - 10.8 * (f.sex === 'male' ? 1 : 0) - 5.4,
        );
    }
    if (f.fatAuthor === 'lean') {
      fatDetail =
        'Lean 1996 (18–83 años): masculino 0.567×cintura(cm)+0.101×edad−31.8; femenino 0.439×cintura+0.221×edad−9.4.';
      if (waist !== null && age <= 83)
        fat = percentage(
          f.sex === 'male'
            ? 0.567 * waist + 0.101 * age - 31.8
            : 0.439 * waist + 0.221 * age - 9.4,
        );
    }
    if (['durnin', 'brozek'].includes(String(f.fatAuthor))) {
      fatDetail = `Densidad Durnin-Womersley con cuatro pliegues(mm), log10 y coeficientes por edad/sexo, 18–72 años. ${f.fatAuthor === 'brozek' ? 'Brozek: (4.57/densidad−4.142)×100.' : 'Siri: (4.95/densidad−4.50)×100.'} Solo 0<porcentaje<100.`;
      if (density !== null)
        fat = percentage(
          f.fatAuthor === 'brozek'
            ? (4.57 / density - 4.142) * 100
            : (4.95 / density - 4.5) * 100,
        );
    }
  }
  const fatKg = fat !== null && w !== null ? (fat * w) / 100 : null;
  const wrist = measure('wristBreadth'),
    femur = measure('femur');
  const bone =
    eligible &&
    f.boneAuthor === 'rocha' &&
    h !== null &&
    wrist !== null &&
    femur !== null
      ? positive(
          3.02 *
            ((h / 100) ** 2 * (wrist / 100) * (femur / 100) * 400) ** 0.712,
        )
      : null;
  const residual =
    eligible && f.residualAuthor === 'wurch' && w !== null
      ? w * (f.sex === 'male' ? 0.241 : 0.209)
      : null;
  const muscle =
    f.muscleAuthor === 'remainder' &&
    w !== null &&
    fatKg !== null &&
    bone !== null &&
    residual !== null
      ? positive(w - fatKg - bone - residual)
      : null;
  const base =
    ' No es diagnóstico ni aprobación clínica. Depende de revisión activa, población adulta general y sexo de ecuación; no se infiere del género.';
  const make = (
    id: string,
    label: string,
    unit: string,
    value: number | null,
    detail: string,
  ) => row('formulas', id, label, unit, value, detail + base, active);
  return [
    make(
      'bmr',
      'Metabolismo basal / en reposo estimado',
      'kcal/día',
      bmr,
      bmrDetail,
    ),
    make(
      'exercise',
      f.exercise === 'mets'
        ? 'Energía bruta de actividades declaradas'
        : 'Incremento por factor de actividad',
      'kcal',
      exercise,
      f.exercise === 'mets'
        ? 'MET×0.0175×kg×min. No se añade automáticamente a TMB ni representa 24 horas.'
        : 'TMB×(factor−1). Factor elegido, no inferido; no son kcal medidas de ejercicio.',
    ),
    make(
      'stress',
      'Ajuste por estrés fisiológico',
      'kcal/día',
      stress,
      'Cero solo con sin ajuste declarado y TMB disponible. Doce condiciones históricas conservadas sin factores no verificados.',
    ),
    make(
      'expenditure',
      'Gasto diario estimado por factor',
      'kcal/día',
      expenditure,
      'TMB×factor, solo con sin ajuste por estrés declarado; no prescripción.',
    ),
    make(
      'consumption',
      'Consumo R24 declarado',
      'kcal',
      consumption,
      'Solo total completo; nunca subtotal de tiempos o alimentos desconocidos.',
    ),
    make(
      'balance',
      'Diferencia consumo − gasto',
      'kcal',
      balance,
      'Consumo−gasto completo. Signo negativo/positivo no equivale a diagnóstico de déficit/superávit; cero no confirma equilibrio clínico.',
    ),
    make('fat', 'Grasa corporal estimada', '%', fat, fatDetail),
    make(
      'fatKg',
      'Kilogramos de grasa estimados',
      'kg',
      fatKg,
      'Peso×porcentaje/100.',
    ),
    make(
      'density',
      'Densidad corporal estimada',
      'g/cm³',
      f.densityAuthor === 'durnin' ? density : null,
      'Durnin-Womersley: c−m×log10(suma de bíceps, tríceps, subescapular y suprailíaco). Siri convierte densidad en grasa, no estima densidad.',
    ),
    make(
      'bone',
      'Masa ósea estimada · Rocha',
      'kg',
      bone !== null && w !== null && bone >= w ? null : bone,
      '3.02×(talla²×biestiloideo×femoral×400)^0.712; longitudes convertidas a metros. No densidad mineral ósea; rechaza masa ≥peso.',
    ),
    make(
      'residual',
      'Masa residual estimada · Wurch',
      'kg',
      residual,
      'Peso×0.241 masculino / ×0.209 femenino. Modelo histórico, no medición independiente.',
    ),
    make(
      'muscle',
      'Componente por diferencia',
      'kg',
      muscle,
      'Peso−grasa(kg)−masa ósea−residual. No equivale a medición validada de músculo esquelético.',
    ),
    make(
      'bmi',
      'IMC numérico',
      'kg/m²',
      bmi,
      'Peso(kg)/talla(m)², sin clasificación automática.',
    ),
  ];
}

/** Server-only, deterministic engine v1. Never reads submitted result values or labels. */
export function calculateAssessment(
  assessment: AssessmentInput,
  birthDate: string,
  calculatedAt: Date,
) {
  const c = assessment.captures;
  const r = recall(c),
    a = activities(c);
  const results = [
    ...anthropometry(c),
    ...formulas(c, birthDate, r, a),
    ...r,
    ...a,
  ];
  return {
    engineVersion: 'nutriline-server-assessment-1' as const,
    catalogVersion: 'legacy-six-foods-1' as const,
    resultsOrigin: 'server' as const,
    clinicalApproval: false as const,
    calculatedAt: calculatedAt.toISOString(),
    arithmetic:
      'IEEE-754 binary64; sin redondeo intermedio. BMI en CalculationResult usa aritmética decimal y seis decimales.',
    inputsHash: createHash('sha256')
      .update(JSON.stringify({ birthDate, captures: c }))
      .digest('hex'),
    results,
  };
}
