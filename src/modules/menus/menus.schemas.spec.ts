import { createMenuSchema, editMenuSchema } from './menus.schemas.js';
import { menuFixture } from '../../../test/menu-fixture.js';
describe('contrato estricto de menús independientes', () => {
  it('v3 conserva ingredientes y referencias originales; v2 no acepta datos que no puede representar', () => {
    const legacy = menuFixture();
    const ingredient = {
      catalogId: '1231',
      catalogVersion: 'legacy-foods-2176-v1',
      name: 'Manzana',
      quantity: '0,5',
      unit: 'pieza',
    };
    const input = {
      ...legacy,
      schemaVersion: 3,
      menu: {
        ...legacy.menu,
        meals: {
          custom: {
            ...legacy.menu.meals.breakfast,
            label: 'Mi tiempo',
            preparations: [
              {
                ...legacy.menu.meals.breakfast.preparations[0],
                ingredients: [ingredient],
              },
            ],
          },
        },
      },
    };
    expect(createMenuSchema.parse(input)).toEqual(input);
    expect(
      createMenuSchema.safeParse({ ...input, schemaVersion: 2 }).success,
    ).toBe(false);
    for (const change of [
      { quantity: '0' },
      { quantity: '1/2' },
      { catalogId: '999999' },
      { name: 'Nombre ajeno al catálogo' },
      { catalogVersion: 'otro' },
      { unit: '' },
    ]) {
      const modified = structuredClone(input);
      Object.assign(
        modified.menu.meals.custom.preparations[0].ingredients[0],
        change,
      );
      expect(createMenuSchema.safeParse(modified).success).toBe(false);
    }
  });
  const dynamicInput = () => {
    const legacy = menuFixture();
    return {
      ...legacy,
      schemaVersion: 2 as const,
      menu: {
        ...legacy.menu,
        meals: {
          training: {
            ...legacy.menu.meals.breakfast,
            label: 'Después de entrenar',
          },
        },
      },
    };
  };
  it('admite nombres libres en v2, mantiene v1 y permite migrar con una nueva revisión', () => {
    const input = dynamicInput();
    expect(createMenuSchema.parse(input)).toEqual(input);
    expect(createMenuSchema.parse(menuFixture()).schemaVersion).toBe(1);
    expect(
      editMenuSchema.parse({ ...input, expectedRevision: 1 }).schemaVersion,
    ).toBe(2);
  });
  it('rechaza tiempos vacíos, nombres ausentes, identificadores peligrosos y campos visuales', () => {
    const input = dynamicInput();
    for (const meals of [
      {},
      { training: { ...input.menu.meals.training, label: '' } },
      { training: { ...input.menu.meals.training, label: ' '.repeat(2) } },
      { training: { ...input.menu.meals.training, label: 'x'.repeat(101) } },
      { constructor: input.menu.meals.training },
      { 'bad.path': input.menu.meals.training },
      {
        training: {
          ...input.menu.meals.training,
          preparations: [
            {
              ...input.menu.meals.training.preparations[0],
              instructionsEnabled: true,
            },
          ],
        },
      },
      Object.fromEntries(
        Array.from({ length: 21 }, (_, i) => [
          `time_${i}`,
          input.menu.meals.training,
        ]),
      ),
    ])
      expect(
        createMenuSchema.safeParse({ ...input, menu: { ...input.menu, meals } })
          .success,
      ).toBe(false);
  });
  it('conserva precisión, espacios y borradores excluidos sin validarlos como indicaciones', () => {
    const input = menuFixture();
    expect(createMenuSchema.parse(input)).toEqual(input);
  });
  it.each(['0', '-1', '1e3', 'NaN', 'Infinity', '1/2', '0,0', '1234567890123'])(
    'rechaza cantidad %s',
    (value) => {
      const input = menuFixture();
      input.menu.meals.breakfast.preparations[0].quantity = value;
      expect(createMenuSchema.safeParse(input).success).toBe(false);
    },
  );
  it('requiere dependencias y selección explícita, rechaza inferencias/campos extra', () => {
    const base = menuFixture();
    for (const change of [
      { nutritionistId: 'foreign' },
      { schemaVersion: 2 },
      { clientRequestId: 'bad' },
      { patientUpdatedAt: 'yesterday' },
      { menu: { ...base.menu, date: '2026-02-30' } },
      { menu: { ...base.menu, nextReview: '2026-01-01' } },
      { menu: { ...base.menu, calories: 100 } },
    ])
      expect(createMenuSchema.safeParse({ ...base, ...change }).success).toBe(
        false,
      );
    base.menu.meals.breakfast.status = 'notIncluded';
    expect(createMenuSchema.safeParse(base).success).toBe(false);
    base.menu.meals.breakfast.status = 'included';
    base.menu.meals.breakfast.preparations = [];
    expect(createMenuSchema.safeParse(base).success).toBe(false);
    expect(editMenuSchema.safeParse(menuFixture()).success).toBe(false);
  });
  it('rechaza más de 50 filas y tamaño de captura sin truncar', () => {
    const input = menuFixture(),
      row = input.menu.meals.breakfast.preparations[0];
    input.menu.meals.breakfast.preparations = Array.from(
      { length: 51 },
      () => row,
    );
    expect(createMenuSchema.safeParse(input).success).toBe(false);
    input.menu.meals.breakfast.preparations = Array.from(
      { length: 50 },
      () => ({
        ...row,
        instructions: 'é'.repeat(1000),
        substitutions: 's'.repeat(1000),
      }),
    );
    expect(createMenuSchema.safeParse(input).success).toBe(false);
  });
});
