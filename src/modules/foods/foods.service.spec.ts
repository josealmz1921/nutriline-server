import { FoodsService, foodCatalogVersion } from './foods.service.js';
import { foodSearchSchema } from './foods.controller.js';
import { legacyFoodRows, legacyFoodDigest } from './legacy-foods.data.js';
import { createHash } from 'node:crypto';

describe('catálogo histórico de solo lectura', () => {
  const service = new FoodsService();
  it('recupera los 2176 alimentos sin exponer nutrientes como datos clínicos', () => {
    const result = service.search({ q: '', page: 1, pageSize: 10 });
    expect(result.meta.total).toBe(2176);
    expect(result.meta.catalogVersion).toBe(foodCatalogVersion);
    expect(result.data).toHaveLength(10);
    expect(result.data[0]).not.toHaveProperty('energiaKcal');
    expect(new Set(legacyFoodRows.map((row) => row.idAlimento)).size).toBe(
      2176,
    );
    expect(legacyFoodRows[0].energiaKcal).toBe('42');
    expect(
      createHash('sha256').update(JSON.stringify(legacyFoodRows)).digest('hex'),
    ).toBe(legacyFoodDigest);
  });
  it('busca por palabras sin distinguir acentos y pagina de forma estable', () => {
    const plain = service.search({ q: 'PLATANO', page: 1, pageSize: 50 });
    const accented = service.search({ q: 'plátano', page: 1, pageSize: 50 });
    expect(plain.data).toEqual(accented.data);
    expect(plain.data.some((food) => food.id === '1748')).toBe(true);
    expect(
      service
        .search({ q: 'maiz tortilla', page: 1, pageSize: 50 })
        .data.some((food) => food.id === '2067'),
    ).toBe(true);
    const first = service.search({ q: '', page: 1, pageSize: 10 });
    const second = service.search({ q: '', page: 2, pageSize: 10 });
    expect(first.data.map((food) => food.id)).not.toEqual(
      second.data.map((food) => food.id),
    );
    expect(
      service.search({ q: 'zzzinexistente', page: 1, pageSize: 10 }).meta.total,
    ).toBe(0);
  });
  it('marca referencias incompletas sin corregir ni descartar las cadenas originales', () => {
    const all = service.search({ q: '', page: 1, pageSize: 3000 }).data;
    expect(all.filter((food) => food.quantity === 'i')).toHaveLength(2);
    expect(all.filter((food) => food.unit === '9')).toHaveLength(13);
    expect(
      all
        .filter((food) => food.quantity === 'i' || food.unit === '9')
        .every((food) => !food.usableReference),
    ).toBe(true);
  });
  it('limita búsquedas y rechaza paginación inválida y campos extra', () => {
    expect(foodSearchSchema.parse({})).toEqual({
      q: '',
      page: 1,
      pageSize: 20,
    });
    for (const input of [
      { page: 0 },
      { pageSize: 51 },
      { q: 'a'.repeat(101) },
      { unknown: true },
    ])
      expect(foodSearchSchema.safeParse(input).success).toBe(false);
  });
});
