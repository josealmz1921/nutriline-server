import { Injectable } from '@nestjs/common';
import { legacyFoodRows, legacyFoodDigest } from './legacy-foods.data.js';

export const foodCatalogVersion = 'legacy-foods-2176-v1';
const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim();
const foods = legacyFoodRows.map((raw) => ({
  id: raw.idAlimento!,
  name: raw.Alimento!,
  quantity: raw.cantidad ?? '',
  fraction: raw.cantidadF ?? '',
  unit: raw.unidad ?? '',
  group: raw.GrupoAlimento ?? '',
  usableReference:
    /^\d+(?:\.\d+)?$/.test(raw.cantidad ?? '') &&
    Number(raw.cantidad) > 0 &&
    /\p{L}/u.test(raw.unidad ?? ''),
}));

@Injectable()
export class FoodsService {
  search(query: { q: string; page: number; pageSize: number }) {
    const terms = normalize(query.q).split(/\s+/).filter(Boolean);
    const matching = foods.filter((food) =>
      terms.every((term) => normalize(food.name).includes(term)),
    );
    return {
      data: matching.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      meta: {
        ...query,
        total: matching.length,
        catalogVersion: foodCatalogVersion,
        source: 'ProyectoDietas/nutrilinedb.sql · tabla alimentos',
        digest: legacyFoodDigest,
        warning:
          'Catálogo histórico sin validación clínica; procedencia/licencia pendientes de verificar. Revisa cantidades y unidades. Sin conversiones ni cálculos nutricionales.',
      },
    };
  }
}
