import { Injectable } from '@nestjs/common';
import {
  legacyActivityDigest,
  legacyActivityRows,
} from './legacy-activities.data.js';

export const activityCatalogVersion = 'legacy-activities-822-v1';
const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim();

@Injectable()
export class ActivitiesService {
  search(query: { q: string; page: number; pageSize: number }) {
    const terms = normalize(query.q).split(/\s+/).filter(Boolean);
    const matches = legacyActivityRows.filter((row) =>
      terms.every((term) =>
        normalize(`${row.category} ${row.name}`).includes(term),
      ),
    );
    return {
      data: matches
        .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
        .map((row) => ({ ...row })),
      meta: {
        ...query,
        total: matches.length,
        catalogVersion: activityCatalogVersion,
        source: 'ProyectoDietas/nutrilinedb.sql · tabla deportsmets',
        digest: legacyActivityDigest,
        warning:
          'Catálogo histórico sin validación clínica; procedencia/licencia pendientes de verificar. Revisa actividad y MET. Textos originales sin corrección automática.',
      },
    };
  }
}
