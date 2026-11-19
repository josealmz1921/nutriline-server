import { randomUUID } from 'node:crypto';
import type { CreateMenu } from '../src/modules/menus/menus.schemas.js';
export const menuFixture = (
  updatedAt = '2026-11-19T12:00:00.000Z',
): CreateMenu => ({
  schemaVersion: 1,
  clientRequestId: randomUUID(),
  patientUpdatedAt: updatedAt,
  menu: {
    date: '2026-11-19',
    professional: 'Nombre mostrado ficticio',
    recommendations: 'Indicaciones ficticias',
    nextReview: '2026-11-25',
    meals: {
      breakfast: {
        status: 'included',
        time: '08:30',
        preparations: [
          {
            name: ' Avena ficticia ',
            quantity: '1,50',
            unit: 'taza',
            instructions: ' Preparación manual ',
            substitutions: 'Ninguna',
          },
        ],
      },
      firstSnack: {
        status: 'notIncluded',
        time: '99:99',
        preparations: [
          {
            name: 'Borrador excluido',
            quantity: '',
            unit: '',
            instructions: 'No prescrito',
            substitutions: '',
          },
        ],
      },
      lunch: { status: 'notIncluded', time: '', preparations: [] },
      secondSnack: { status: 'notIncluded', time: '', preparations: [] },
      dinner: { status: 'notIncluded', time: '', preparations: [] },
    },
  },
});
