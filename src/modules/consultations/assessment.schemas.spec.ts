import { completeAssessmentFixture } from '../../../test/assessment-fixture.js';
import {
  completeConsultationSchema,
  createConsultationSchema,
} from './consultations.schemas.js';

describe('evaluación completa versionada', () => {
  it('no admite metadatos de resultados de servidor suministrados por el cliente', () => {
    const input = completeAssessmentFixture();
    expect(
      completeConsultationSchema.safeParse({
        ...input,
        assessment: {
          ...input.assessment,
          serverCalculations: {
            resultsOrigin: 'server',
            clinicalApproval: true,
            results: [],
          },
        },
      }).success,
    ).toBe(false);
  });
  it('permite fecha de medición ausente solo con medidas excluidas explícitamente', () => {
    const input = completeAssessmentFixture();
    input.assessment.measuredAt = null;
    input.assessment.localTimes.measuredAt = null;
    expect(completeConsultationSchema.safeParse(input).success).toBe(true);
    input.assessment.captures.anthropometry = {
      measurementAvailability: 'captured',
      weight: '70',
      height: '175',
    };
    expect(completeConsultationSchema.safeParse(input).success).toBe(false);
  });
  it('conserva borradores excluidos inválidos sin normalizarlos a ceros', () => {
    const input = completeAssessmentFixture();
    const saved = createConsultationSchema.parse(input);
    expect(saved).toEqual(input);
    expect(input.assessment.captures.anthropometry.weight).toBe(
      'borrador inválido',
    );
    expect(input.assessment.results.every((row) => row.value === null)).toBe(
      true,
    );
  });
  it('no acepta captura parcial ni declara aprobación clínica', () => {
    const input = completeAssessmentFixture();
    for (const changes of [
      { schemaVersion: 2 },
      { clinicalApproval: true },
      { engineVersion: 'otro-motor' },
      { resultsOrigin: 'server' },
      { symptoms: ['Otro síntoma inventado'] },
      { timeZone: 'Zona/Inexistente' },
    ]) {
      expect(
        completeConsultationSchema.safeParse({
          ...input,
          assessment: { ...input.assessment, ...changes },
        }).success,
      ).toBe(false);
    }
    const { habits: _omitted, ...partial } = input.assessment.captures;
    void _omitted;
    expect(
      completeConsultationSchema.safeParse({
        ...input,
        assessment: { ...input.assessment, captures: partial },
      }).success,
    ).toBe(false);
  });
  it('peso y talla son esenciales solo con mediciones capturadas', () => {
    const input = completeAssessmentFixture();
    input.assessment.captures.anthropometry = {
      measurementAvailability: 'captured',
      weight: '70,25',
      height: '175',
    };
    expect(completeConsultationSchema.safeParse(input).success).toBe(true);
    for (const weight of ['', '0', '1e2', '-1', '70kg']) {
      input.assessment.captures.anthropometry.weight = weight;
      expect(completeConsultationSchema.safeParse(input).success).toBe(false);
    }
  });
  it('la bioquímica activa exige valor no negativo y su unidad', () => {
    const input = completeAssessmentFixture();
    input.assessment.captures.biochemistry = {
      availability: 'captured',
      results: { glucose: { value: '0', unit: 'mg/dl' } },
    };
    expect(completeConsultationSchema.safeParse(input).success).toBe(true);
    input.assessment.captures.biochemistry.results!.glucose!.unit = '';
    expect(completeConsultationSchema.safeParse(input).success).toBe(false);
  });
  it('R24 exige decisiones explícitas y alimentos completos solo donde hubo consumo', () => {
    const input = completeAssessmentFixture();
    input.assessment.captures.recall = {
      availability: 'captured',
      meals: {
        breakfast: { status: 'notConsumed' },
        firstSnack: { status: 'unavailable' },
        lunch: { status: 'notConsumed' },
        secondSnack: { status: 'notConsumed' },
        dinner: { status: 'notConsumed' },
      },
    };
    expect(completeConsultationSchema.safeParse(input).success).toBe(true);
    input.assessment.captures.recall.meals!.breakfast = {
      status: 'captured',
      preparations: [],
    };
    expect(completeConsultationSchema.safeParse(input).success).toBe(false);
    input.assessment.captures.recall.meals!.breakfast = { status: 'pending' };
    expect(completeConsultationSchema.safeParse(input).success).toBe(false);
  });
  it('hábitos no inventa actividad y rechaza más de 24 horas', () => {
    const input = completeAssessmentFixture();
    input.assessment.captures.habits = {
      availability: 'captured',
      activityStatus: 'none',
      sleepHours: '0',
    };
    expect(completeConsultationSchema.safeParse(input).success).toBe(true);
    input.assessment.captures.habits.activityStatus = 'captured';
    input.assessment.captures.habits.activities = [
      {
        name: 'Actividad ficticia',
        duration: '25',
        unit: 'hours',
        met: '2',
        source: 'Prueba',
      },
    ];
    expect(completeConsultationSchema.safeParse(input).success).toBe(false);
  });
  it('no admite resultados de exclusiones, desconocidos, duplicados ni conjuntos truncados', () => {
    const input = completeAssessmentFixture();
    input.assessment.results[0].value = 0;
    expect(completeConsultationSchema.safeParse(input).success).toBe(false);
    input.assessment.results[0].value = null;
    input.assessment.results.push({ ...input.assessment.results[0] });
    expect(completeConsultationSchema.safeParse(input).success).toBe(false);
    input.assessment.results.pop();
    input.assessment.results.pop();
    expect(completeConsultationSchema.safeParse(input).success).toBe(false);
  });
  it('rechaza campos ajenos, menú y datos sin propietario definido por sesión', () => {
    const input = completeAssessmentFixture();
    expect(
      completeConsultationSchema.safeParse({
        ...input,
        nutritionistId: 'owner',
      }).success,
    ).toBe(false);
    expect(
      completeConsultationSchema.safeParse({ ...input, menu: {} }).success,
    ).toBe(false);
    expect(
      completeConsultationSchema.safeParse({
        ...input,
        assessment: {
          ...input.assessment,
          captures: { ...input.assessment.captures, menu: {} },
        },
      }).success,
    ).toBe(false);
  });
});
