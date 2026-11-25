import { createHash } from 'node:crypto';
import { ActivitiesService } from './activities.service.js';
import { activitySearchSchema } from './activities.controller.js';
import {
  legacyActivityRows,
  legacyActivityDigest,
} from './legacy-activities.data.js';

describe('catálogo histórico de actividades', () => {
  const service = new ActivitiesService();
  it('preserva 822 IDs, 21 categorías, MET y digest sin corregir textos', () => {
    expect(service.search({ q: '', page: 1, pageSize: 10 }).meta.total).toBe(
      822,
    );
    expect(new Set(legacyActivityRows.map((r) => r.id)).size).toBe(822);
    expect(new Set(legacyActivityRows.map((r) => r.category)).size).toBe(21);
    expect(legacyActivityRows.every((r) => Number(r.met) > 0)).toBe(true);
    expect(legacyActivityRows.find((r) => r.id === '12135')?.name).toBe(
      'Correr 225 km/h (26 min/km)',
    );
    expect(
      legacyActivityRows.filter((r) => r.name === 'Pesca en hielo sentado'),
    ).toHaveLength(2);
    expect(
      createHash('sha256')
        .update(JSON.stringify(legacyActivityRows))
        .digest('hex'),
    ).toBe(legacyActivityDigest);
  });
  it('busca palabras en nombre y categoría sin acentos, pagina y no muta el catálogo', () => {
    const search = (q: string, page = 1) =>
      service.search({ q, page, pageSize: 10 });
    expect(search('CICLÍSMO').data).toEqual(search('ciclismo').data);
    expect(search('yoga hatha').data[0]).toMatchObject({
      id: '2150',
      met: '2.5',
    });
    expect(search('', 1).data).not.toEqual(search('', 2).data);
    expect(search('zzzinexistente').data).toEqual([]);
    const first = search('');
    first.data[0].name = 'Mutado';
    expect(search('').data[0].name).not.toBe('Mutado');
  });
  it('valida el contrato de búsqueda', () => {
    expect(activitySearchSchema.parse({})).toEqual({
      q: '',
      page: 1,
      pageSize: 20,
    });
    for (const input of [
      { page: 0 },
      { pageSize: 51 },
      { q: 'x'.repeat(101) },
      { extra: true },
    ])
      expect(activitySearchSchema.safeParse(input).success).toBe(false);
  });
});
