import { createMenuSchema, editMenuSchema } from './menus.schemas.js';
import { menuFixture } from '../../../test/menu-fixture.js';
describe('contrato estricto de menús independientes', () => {
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
