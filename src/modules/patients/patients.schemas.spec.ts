import {
  createPatientSchema,
  updatePatientSchema,
  listPatientsSchema,
} from './patients.schemas.js';

const valid = { fullName: ' Paciente Ficticio ', birthDate: '1992-05-15' };
describe('validación de pacientes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('normaliza campos sin inventar datos de contacto', () => {
    expect(
      createPatientSchema.parse({
        ...valid,
        email: '  DEMO@EXAMPLE.INVALID  ',
      }),
    ).toEqual({
      fullName: 'Paciente Ficticio',
      birthDate: valid.birthDate,
      email: 'demo@example.invalid',
    });
    expect(createPatientSchema.parse(valid)).not.toHaveProperty('phone');
  });
  it.each([
    { birthDate: '2023-02-29' },
    { birthDate: '2000-02-30' },
    { birthDate: '0999-12-31' },
    { birthDate: '1992-5-15' },
    { birthDate: '1992-05-15T00:00:00Z' },
    { birthDate: null },
    { fullName: '   ' },
    { fullName: 'x'.repeat(151) },
    { email: '' },
    { phone: '' },
    { occupation: 'x'.repeat(151) },
    { nutritionistId: 'chosen-owner' },
    { role: 'ADMIN' },
    { id: 'chosen-id' },
    { archivedAt: null },
  ])('rechaza entrada inválida %j', (changes) => {
    expect(
      createPatientSchema.safeParse({ ...valid, ...changes }).success,
    ).toBe(false);
  });
  it('valida hoy UTC en cada ejecución; admite año bisiesto sin decidir rangos clínicos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T23:59:59Z'));
    expect(
      createPatientSchema.safeParse({ ...valid, birthDate: '2026-11-05' })
        .success,
    ).toBe(false);
    vi.setSystemTime(new Date('2026-11-05T00:00:00Z'));
    expect(
      createPatientSchema.safeParse({ ...valid, birthDate: '2026-11-05' })
        .success,
    ).toBe(true);
    expect(
      createPatientSchema.safeParse({ ...valid, birthDate: '2000-02-29' })
        .success,
    ).toBe(true);
  });
  it('PATCH es parcial, no vacío, y permite limpiar contacto con null', () => {
    expect(updatePatientSchema.parse({ phone: null })).toEqual({ phone: null });
    expect(updatePatientSchema.safeParse({}).success).toBe(false);
    expect(updatePatientSchema.safeParse({ fullName: null }).success).toBe(
      false,
    );
    expect(
      updatePatientSchema.safeParse({ nutritionistId: 'other' }).success,
    ).toBe(false);
  });
  it('paginación acotada y archived explícito sin coerción booleana ambigua', () => {
    expect(listPatientsSchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      archived: false,
    });
    expect(
      listPatientsSchema.parse({
        page: '2',
        pageSize: '100',
        archived: 'true',
      }),
    ).toEqual({ page: 2, pageSize: 100, archived: true });
  });
  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: '1e2' },
    { page: '1000001' },
    { pageSize: '101' },
    { pageSize: '' },
    { page: ['1', '2'] },
    { archived: '1' },
    { archived: true },
    { search: ' ' },
    { search: 'x'.repeat(151) },
    { nutritionistId: 'other' },
  ])('rechaza query inválida %j', (query) => {
    expect(listPatientsSchema.safeParse(query).success).toBe(false);
  });
});
