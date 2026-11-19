import { randomUUID } from 'node:crypto';
import {
  assessmentAnthropometryIds,
  assessmentFormulaResultIds,
  assessmentNutrientIds,
} from '../src/modules/consultations/assessment.schemas.js';
import { completeConsultationSchema } from '../src/modules/consultations/consultations.schemas.js';

export function completeAssessmentFixture(
  patientUpdatedAt = '2026-01-01T00:00:00.000Z',
) {
  return completeConsultationSchema.parse({
    occurredAt: '2026-11-05T10:30:00.000Z',
    reason: 'Evaluación ficticia de integración',
    notes: null,
    clientRequestId: randomUUID(),
    patientUpdatedAt,
    assessment: {
      schemaVersion: 1,
      engineVersion: 'nutriline-client-assessment-1',
      resultsOrigin: 'client-snapshot',
      clinicalApproval: false,
      timeZone: 'UTC',
      measuredAt: '2026-11-05T10:15:00.000Z',
      localTimes: {
        occurredAt: '2026-11-05T10:30',
        measuredAt: '2026-11-05T10:15',
      },
      symptoms: ['Fiebre'],
      captures: {
        anthropometry: {
          measurementAvailability: 'notPerformed',
          weight: 'borrador inválido',
        },
        biochemistry: {
          availability: 'unavailable',
          results: { glucose: { value: 'borrador inválido', unit: 'mg/dl' } },
        },
        recall: {
          availability: 'notPerformed',
          meals: {
            breakfast: {
              status: 'captured',
              preparations: [
                {
                  name: 'Borrador excluido',
                  foods: [
                    { name: 'Ejemplo', quantity: 'incorrecta', unit: '' },
                  ],
                },
              ],
            },
          },
        },
        habits: { availability: 'unavailable', sleepHours: 'dato inválido' },
        formulas: {
          availability: 'notPerformed',
          referenceDate: 'sin fecha',
          metabolicAuthor: 'mifflin',
        },
      },
      results: Object.entries({
        anthropometry: assessmentAnthropometryIds,
        formulas: assessmentFormulaResultIds,
        recall: assessmentNutrientIds,
        activities: ['metMinutes', 'kcal'],
      }).flatMap(([group, ids]) =>
        ids.map((id) => ({
          group,
          id,
          label: id,
          unit: '',
          value: null,
          detail: 'Instantánea ficticia no verificada por el servidor.',
        })),
      ),
    },
  });
}
