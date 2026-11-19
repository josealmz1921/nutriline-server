import {
  calculateAssessment,
  ageAtDate,
  durninDensity,
} from './assessment-engine.v1.js';
import { completeAssessmentFixture } from '../../../test/assessment-fixture.js';
import { assessmentMealIds } from '../consultations/assessment.schemas.js';

const now = new Date('2026-11-05T10:30:00Z');
function fixture() {
  const a = completeAssessmentFixture().assessment;
  a.captures.anthropometry = {
    measurementAvailability: 'captured',
    weight: '70',
    height: '175',
    waist: '80',
    hip: '95',
    triceps: '12',
    subscapular: '14',
    supraspinale: '10',
    suprailiac: '15',
    biceps: '8',
    humerus: '7',
    femur: '9.5',
    flexedArm: '32',
    calfGirth: '37',
    calfFold: '14',
    wristBreadth: '5.5',
  };
  a.captures.formulas = {
    availability: 'captured',
    referenceDate: '2026-11-05',
    sex: 'male',
    population: 'generalAdult',
    metabolicAuthor: 'mifflin',
    exercise: '1.55',
    stress: 'none',
    fatAuthor: 'durnin',
    densityAuthor: 'durnin',
    boneAuthor: 'rocha',
    residualAuthor: 'wurch',
    muscleAuthor: 'remainder',
  };
  a.captures.recall = {
    availability: 'captured',
    meals: Object.fromEntries(
      assessmentMealIds.map((id) => [id, { status: 'notConsumed' as const }]),
    ),
  };
  a.captures.habits = { availability: 'captured', activityStatus: 'none' };
  return a;
}
function result(a = fixture(), birth = '1990-01-01') {
  const saved = calculateAssessment(a, birth, now);
  return {
    saved,
    get: (group: string, id: string) =>
      saved.results.find((row) => row.group === group && row.id === id)!,
  };
}
describe('motor de evaluación del servidor v1', () => {
  it('genera 47 estados propios, independientemente de valores/etiquetas enviados', () => {
    const a = fixture();
    a.results = a.results.map((row) => ({
      ...row,
      value: 999999,
      label: 'Valor manipulado',
      unit: 'falsa',
      detail: 'No confiar',
    }));
    const { saved, get } = result(a);
    expect(saved.results).toHaveLength(47);
    expect(get('anthropometry', 'bmi').value).toBeCloseTo(22.857142857);
    expect(get('formulas', 'bmr').value).toBeCloseTo(1618.75);
    expect(get('formulas', 'expenditure').value).toBeCloseTo(2509.0625);
    expect(get('formulas', 'balance').value).toBeCloseTo(-2509.0625);
    expect(JSON.stringify(saved)).not.toContain('Valor manipulado');
    expect(saved).toMatchObject({
      engineVersion: 'nutriline-server-assessment-1',
      resultsOrigin: 'server',
      clinicalApproval: false,
      calculatedAt: now.toISOString(),
    });
    expect(saved.inputsHash).toHaveLength(64);
    expect(a.results[0].value).toBe(999999);
  });
  it('no usa borradores excluidos aunque contengan medidas, comidas o MET válidos', () => {
    const a = fixture();
    a.captures.anthropometry.measurementAvailability = 'unavailable';
    a.captures.recall.availability = 'notPerformed';
    a.captures.habits.availability = 'unavailable';
    a.captures.formulas.availability = 'notPerformed';
    expect(
      result(a).saved.results.every(
        (row) =>
          row.value === null &&
          row.subtotal == null &&
          row.status === 'excluded',
      ),
    ).toBe(true);
  });
  it('cada antropometría depende de sus medidas y no sustituye supraespinal', () => {
    const a = fixture();
    delete a.captures.anthropometry.supraspinale;
    let r = result(a);
    expect(r.get('anthropometry', 'endomorphy').value).toBeNull();
    expect(r.get('anthropometry', 'pointX').value).toBeNull();
    expect(r.get('anthropometry', 'mesomorphy').value).not.toBeNull();
    a.captures.anthropometry.flexedArm = '0.5';
    r = result(a);
    expect(r.get('anthropometry', 'mesomorphy').value).toBeNull();
    expect(r.get('anthropometry', 'bmi').value).not.toBeNull();
  });
  it('R24 separa subtotal conocido de consumo completo y valida referencia exacta', () => {
    const a = fixture();
    a.captures.recall.meals!.breakfast = {
      status: 'captured',
      preparations: [
        {
          name: 'Fruta',
          foods: [
            {
              name: 'Manzana',
              quantity: '2',
              unit: 'pieza',
              catalogId: '1231',
            },
          ],
        },
      ],
    };
    let r = result(a);
    expect(r.get('recall', 'energiaKcal')).toMatchObject({
      value: 110,
      subtotal: 110,
    });
    a.captures.recall.meals!.dinner = { status: 'unavailable' };
    r = result(a);
    expect(r.get('recall', 'energiaKcal')).toMatchObject({
      value: null,
      subtotal: 110,
    });
    expect(r.get('formulas', 'consumption').value).toBeNull();
    expect(r.get('formulas', 'balance').value).toBeNull();
    a.captures.recall.meals!.dinner = { status: 'notConsumed' };
    a.captures.recall.meals!.lunch = {
      status: 'captured',
      preparations: [
        {
          name: 'Otro',
          foods: [
            {
              name: 'Nombre cambiado',
              quantity: '1',
              unit: 'pieza',
              catalogId: '1231',
            },
          ],
        },
      ],
    };
    r = result(a);
    expect(r.get('recall', 'energiaKcal')).toMatchObject({
      value: null,
      subtotal: 110,
    });
    expect(r.get('recall', 'vitaminAbugRE')).toMatchObject({
      value: null,
      subtotal: null,
    });
  });
  it('cero solo con no consumo y ninguna actividad explícitos, sin datos no es cero', () => {
    const a = fixture();
    let r = result(a);
    expect(r.get('recall', 'energiaKcal').value).toBe(0);
    expect(r.get('activities', 'kcal').value).toBe(0);
    a.captures.habits.activityStatus = 'unavailable';
    a.captures.recall.availability = 'unavailable';
    r = result(a);
    expect(r.get('activities', 'kcal').value).toBeNull();
    expect(r.get('recall', 'energiaKcal').value).toBeNull();
  });
  it('actividad exige fuente, MET, duración coherente y peso solo para kcal', () => {
    const a = fixture();
    a.captures.habits.activityStatus = 'captured';
    a.captures.habits.activities = [
      {
        name: 'Ejemplo',
        duration: '0,5',
        unit: 'hours',
        met: '2,5',
        source: 'Fuente declarada',
      },
    ];
    let r = result(a);
    expect(r.get('activities', 'metMinutes').value).toBe(75);
    expect(r.get('activities', 'kcal').value).toBeCloseTo(91.875);
    a.captures.anthropometry.measurementAvailability = 'unavailable';
    r = result(a);
    expect(r.get('activities', 'metMinutes').value).toBe(75);
    expect(r.get('activities', 'kcal').value).toBeNull();
    a.captures.habits.activities[0].source = '';
    r = result(a);
    expect(r.get('activities', 'metMinutes').value).toBeNull();
  });
  it.each(['valencia', 'iom'])('no activa autor pendiente %s', (author) => {
    const a = fixture();
    a.captures.formulas.metabolicAuthor = author;
    const r = result(a);
    expect(r.get('formulas', 'bmr').value).toBeNull();
    expect(r.get('formulas', 'expenditure').value).toBeNull();
  });
  it.each(['garrow', 'faulkner', 'yuhasz'])(
    'no extrapola grasa pendiente %s',
    (author) => {
      const a = fixture();
      a.captures.formulas.fatAuthor = author;
      const r = result(a);
      expect(r.get('formulas', 'fat').value).toBeNull();
      expect(r.get('formulas', 'muscle').value).toBeNull();
    },
  );
  it('no infiere sexo ni población, y respeta límites de edad Mifflin', () => {
    const a = fixture();
    a.captures.formulas.sex = '';
    expect(result(a).get('formulas', 'bmr').value).toBeNull();
    a.captures.formulas.sex = 'male';
    a.captures.formulas.population = 'other';
    expect(result(a).get('formulas', 'fat').value).toBeNull();
    a.captures.formulas.population = 'generalAdult';
    expect(result(a, '2008-11-05').get('formulas', 'bmr').value).toBeNull();
    expect(result(a, '2007-11-05').get('formulas', 'bmr').value).not.toBeNull();
    expect(result(a, '1947-11-05').get('formulas', 'bmr').value).toBeNull();
  });
  it('mantiene bandas Schofield sin solapamiento y coeficientes por sexo', () => {
    const a = fixture();
    a.captures.formulas.metabolicAuthor = 'schofield';
    expect(result(a, '1997-11-05').get('formulas', 'bmr').value).toBeCloseTo(
      15.057 * 70 + 692.2,
    );
    expect(result(a, '1996-11-05').get('formulas', 'bmr').value).toBeCloseTo(
      11.472 * 70 + 873.1,
    );
    a.captures.formulas.sex = 'female';
    expect(result(a, '1966-11-05').get('formulas', 'bmr').value).toBeCloseTo(
      9.082 * 70 + 658.5,
    );
  });
  it('densidad usa cuatro pliegues y límites adultos, sin porcentajes recortados', () => {
    expect(durninDensity(18, 'male', [8, 12, 14, 15])).toBeCloseTo(
      1.162 - 0.063 * Math.log10(49),
    );
    expect(durninDensity(73, 'male', [8, 12, 14, 15])).toBeNull();
    expect(durninDensity(25, 'female', [8, 12, 14])).toBeNull();
    expect(ageAtDate('2000-02-29', '2025-02-28')).toBe(24);
    expect(ageAtDate('2000-02-30', '2025-03-01')).toBeNull();
  });
  it('estrés pendiente y MET no se convierten en gasto diario automático', () => {
    const a = fixture();
    a.captures.formulas.stress = 'legacy-0';
    expect(result(a).get('formulas', 'expenditure').value).toBeNull();
    a.captures.formulas.stress = 'none';
    a.captures.formulas.exercise = 'mets';
    expect(result(a).get('formulas', 'exercise').value).toBe(0);
    expect(result(a).get('formulas', 'expenditure').value).toBeNull();
  });
  it('resultado determinista e inputsHash cambian con entradas, no con snapshot cliente', () => {
    const a = fixture(),
      first = result(a).saved;
    a.results[0].value = 123;
    expect(result(a).saved).toEqual(first);
    a.captures.anthropometry.weight = '71';
    expect(result(a).saved.inputsHash).not.toBe(first.inputsHash);
    expect(
      result(a).saved.results.every(
        (row) => row.value === null || Number.isFinite(row.value),
      ),
    ).toBe(true);
  });
});
