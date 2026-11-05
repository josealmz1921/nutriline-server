import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { PatientOwnershipService } from '../patients/patient-ownership.service.js';
import { ConsultationsService } from './consultations.service.js';

const user = {
  role: 'NUTRITIONIST',
  status: 'ACTIVE',
  nutritionistProfile: { id: 'owner' },
} as PublicUser;
const input = {
  occurredAt: '2026-01-02T12:00:00Z',
  reason: 'Demo',
  anthropometry: {
    measuredAt: '2026-01-02T11:00:00Z',
    weightKg: '70',
    heightCm: '175',
  },
};
describe('reglas temporales y transacción de consulta', () => {
  const tx = {
    $queryRaw: vi.fn(),
    patient: { findUniqueOrThrow: vi.fn() },
    consultation: { create: vi.fn() },
  };
  const transaction = vi.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const service = new ConsultationsService(
    { $transaction: transaction } as unknown as PrismaService,
    new PatientOwnershipService(),
  );
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T12:00:00Z'));
    tx.$queryRaw.mockResolvedValue([{ id: 'patient' }]);
    tx.patient.findUniqueOrThrow.mockResolvedValue({
      birthDate: new Date('1990-01-01Z'),
      archivedAt: null,
    });
  });
  afterEach(() => vi.useRealTimers());
  it.each([
    { occurredAt: '2026-01-02T12:00:00.001Z' },
    { occurredAt: '1989-12-31T23:59:59Z' },
    {
      anthropometry: {
        ...input.anthropometry,
        measuredAt: '2026-01-02T12:00:00.001Z',
      },
    },
    {
      anthropometry: {
        ...input.anthropometry,
        measuredAt: '1989-12-31T23:59:59Z',
      },
    },
  ])('rechaza fechas incoherentes con reloj controlado: %j', async (change) => {
    await expect(
      service.create(user, 'patient', { ...input, ...change }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.consultation.create).not.toHaveBeenCalled();
  });
  it('acepta atención en el instante actual y crea medidas/cálculo juntos tras bloqueo', async () => {
    tx.consultation.create.mockRejectedValueOnce(
      new Error('synthetic insert failure'),
    );
    await expect(service.create(user, 'patient', input)).rejects.toThrow(
      'synthetic insert failure',
    );
    expect(tx.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nutritionistId: 'owner',
          patientId: 'patient',
          calculations: {
            create: expect.objectContaining({ value: '22.857143' }),
          },
          anthropometry: {
            create: expect.objectContaining({
              weightKg: '70',
              heightCm: '175',
            }),
          },
        }),
      }),
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.consultation.create.mock.invocationCallOrder[0],
    );
  });
  it('rechaza archivo antes de crear cualquier componente', async () => {
    tx.patient.findUniqueOrThrow.mockResolvedValueOnce({
      birthDate: new Date('1990-01-01Z'),
      archivedAt: new Date(),
    });
    await expect(service.create(user, 'patient', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.consultation.create).not.toHaveBeenCalled();
  });

  it('presenta medidas separadas y cálculo redondeado a dos decimales', async () => {
    tx.consultation.create.mockResolvedValueOnce({
      id: 'visit',
      patientId: 'patient',
      occurredAt: new Date(input.occurredAt),
      reason: 'Demo',
      notes: null,
      createdAt: new Date(),
      anthropometry: {
        measuredAt: new Date(input.anthropometry.measuredAt),
        weightKg: new Prisma.Decimal('70'),
        heightCm: new Prisma.Decimal('175'),
        waistCm: new Prisma.Decimal('80'),
        hipCm: new Prisma.Decimal('95'),
      },
      calculations: [
        {
          methodCode: 'BMI',
          methodVersion: '1',
          value: new Prisma.Decimal('22.857143'),
          unit: 'kg/m2',
          calculatedAt: new Date(),
        },
      ],
    });
    const result = await service.create(user, 'patient', input);
    expect(result.anthropometry).toMatchObject({
      weightKg: '70.000',
      heightCm: '175.000',
      waistCm: '80.000',
      hipCm: '95.000',
    });
    expect(result.calculations[0].value).toBe('22.86');
    expect(result).not.toHaveProperty('nutritionistId');
  });
});
