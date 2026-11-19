import { ConsultationsService } from './consultations.service.js';
import { completeAssessmentFixture } from '../../../test/assessment-fixture.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PatientOwnershipService } from '../patients/patient-ownership.service.js';
import type { PublicUser } from '../auth/auth.types.js';

// Complements isolated MySQL tests; exercises the real orchestration, not a mocked controller service.
it('persiste el resultado propio junto a la captura, relee sin recalcular y devuelve el mismo agregado al reintentar', async () => {
  const input = completeAssessmentFixture();
  input.assessment.captures.anthropometry = {
    measurementAvailability: 'captured',
    weight: '70',
    height: '175',
  };
  input.assessment.captures.formulas = {
    availability: 'captured',
    referenceDate: '2026-11-05',
    sex: 'male',
    population: 'generalAdult',
    metabolicAuthor: 'mifflin',
  };
  const submitted = input.assessment.results.find(
    (row) => row.group === 'formulas' && row.id === 'bmr',
  )!;
  submitted.value = 999999;
  const patient = {
    id: 'synthetic-patient',
    archivedAt: null,
    birthDate: new Date('1990-01-01T00:00:00Z'),
    updatedAt: new Date(input.patientUpdatedAt),
    fullName: 'Paciente ficticio',
  };
  let persisted: Record<string, unknown> | null = null;
  const consultation = {
    findUnique: vi.fn(async () => persisted),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      persisted = {
        ...data,
        id: 'synthetic-consultation',
        createdAt: new Date(),
        anthropometry: null,
        calculations: [],
      };
      return persisted;
    }),
    findFirst: vi.fn(async () => persisted),
  };
  const tx = {
    patient: { findUniqueOrThrow: vi.fn(async () => patient) },
    consultation,
  };
  const db = {
    ...tx,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const ownership = {
    nutritionistId: vi.fn(() => 'synthetic-owner'),
    lockOwned: vi.fn(),
    requireEditable: vi.fn(),
  };
  const service = new ConsultationsService(
    db as unknown as PrismaService,
    ownership as unknown as PatientOwnershipService,
  );
  const first = await service.create({} as PublicUser, patient.id, input);
  const assessment = JSON.parse(JSON.stringify(first.assessment));
  expect(
    assessment.results.find(
      (row: { group: string; id: string }) =>
        row.group === 'formulas' && row.id === 'bmr',
    ).value,
  ).toBe(999999);
  expect(
    assessment.serverCalculations.results.find(
      (row: { group: string; id: string }) =>
        row.group === 'formulas' && row.id === 'bmr',
    ).value,
  ).toBeCloseTo(1618.75);
  expect(assessment.serverCalculations.results).toHaveLength(47);
  expect(assessment.serverCalculations.clinicalApproval).toBe(false);
  patient.birthDate = new Date('1991-01-01T00:00:00Z');
  const read = await service.detail({} as PublicUser, 'synthetic-consultation');
  expect(read.assessment).toEqual(first.assessment);
  const retry = await service.create({} as PublicUser, patient.id, input);
  expect(retry.assessment).toEqual(first.assessment);
  expect(retry).not.toHaveProperty('requestHash');
  expect(consultation.create).toHaveBeenCalledTimes(1);
});
