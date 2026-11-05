import {
  createConsultationSchema,
  listConsultationsSchema,
  measurementSchema,
} from './consultations.schemas.js';

const input = {
  occurredAt: '2026-11-04T17:00:00Z',
  reason: ' Demo ',
  anthropometry: {
    measuredAt: '2026-11-04T17:00:00Z',
    weightKg: '70',
    heightCm: '175',
  },
};
describe('DTOs de consultas', () => {
  it('acepta decimales explícitos, contactos opcionales y zonas', () => {
    expect(createConsultationSchema.parse(input).reason).toBe('Demo');
    expect(
      createConsultationSchema.safeParse({
        ...input,
        occurredAt: '2026-11-04T11:00:00.123-06:00',
      }).success,
    ).toBe(true);
  });
  it.each([
    '0',
    '-1',
    'NaN',
    'Infinity',
    '1e2',
    '1,5',
    ' 70',
    '70 ',
    '1.0001',
    '100000',
    '',
    '00.1',
  ])('rechaza medida %s', (value) => {
    expect(measurementSchema.safeParse(value).success).toBe(false);
  });
  it.each([70, null, undefined])(
    'no convierte tipos ni faltantes en cero: %s',
    (value) => {
      expect(measurementSchema.safeParse(value).success).toBe(false);
    },
  );
  it.each([
    '2026-02-30T17:00:00Z',
    '2026-11-04T17:00:00',
    '0999-01-01T00:00:00Z',
  ])('rechaza instante %s', (occurredAt) => {
    expect(
      createConsultationSchema.safeParse({ ...input, occurredAt }).success,
    ).toBe(false);
  });
  it('rechaza propietario, cálculo, campos extra anidados y cuerpo incompleto', () => {
    for (const extra of [
      { nutritionistId: 'owner' },
      { bmi: '22.86' },
      { patientId: 'patient' },
    ])
      expect(
        createConsultationSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
    expect(
      createConsultationSchema.safeParse({
        ...input,
        anthropometry: { ...input.anthropometry, bmi: '22' },
      }).success,
    ).toBe(false);
    expect(createConsultationSchema.safeParse({ reason: 'Demo' }).success).toBe(
      false,
    );
  });
  it('limita paginación y rechaza queries repetidas/desconocidas', () => {
    expect(listConsultationsSchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    for (const query of [
      { page: ['1', '2'] },
      { pageSize: '101' },
      { search: 'x' },
    ])
      expect(listConsultationsSchema.safeParse(query).success).toBe(false);
  });
});
