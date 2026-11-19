import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PublicUser } from '../auth/auth.types.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { PatientOwnershipService } from './patient-ownership.service.js';
import { PatientsService } from './patients.service.js';
import { reactivatePatientSchema } from './patients.schemas.js';

const user = {
  role: 'NUTRITIONIST',
  status: 'ACTIVE',
  nutritionistProfile: { id: 'owner' },
} as PublicUser;
const version = '2026-11-19T13:00:00.000Z';
const archived = {
  id: 'patient',
  fullName: 'Ficticio',
  birthDate: new Date('1990-01-01Z'),
  archivedAt: new Date(version),
  updatedAt: new Date(version),
};
describe('reactivación del paciente', () => {
  const tx = {
    $queryRaw: vi.fn(),
    patient: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  };
  const transaction = vi.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const service = new PatientsService(
    { $transaction: transaction } as unknown as PrismaService,
    new PatientOwnershipService(),
  );
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(version));
    tx.$queryRaw.mockResolvedValue([{ id: 'patient' }]);
    tx.patient.findUniqueOrThrow.mockResolvedValue(archived);
    tx.patient.update.mockImplementation(async ({ data }) => ({
      ...archived,
      ...data,
    }));
  });
  afterEach(() => vi.useRealTimers());
  it('exige versión válida y no permite campos extra, arrays ni estado elegido por cliente', () => {
    expect(
      reactivatePatientSchema.parse({ expectedUpdatedAt: version }),
    ).toEqual({ expectedUpdatedAt: version });
    for (const input of [
      {},
      undefined,
      { expectedUpdatedAt: 'ayer' },
      { expectedUpdatedAt: [version] },
      { expectedUpdatedAt: version, archivedAt: null },
      { expectedUpdatedAt: version, nutritionistId: 'other' },
    ])
      expect(reactivatePatientSchema.safeParse(input).success).toBe(false);
  });
  it('bloquea la fila propia y cambia solo archivo/versión, incluso dentro del mismo milisegundo', async () => {
    const result = await service.reactivate(user, 'patient', {
      expectedUpdatedAt: version,
    });
    expect(tx.patient.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_nutritionistId: { id: 'patient', nutritionistId: 'owner' },
        },
      }),
    );
    expect(tx.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          archivedAt: null,
          updatedAt: new Date('2026-11-19T13:00:00.001Z'),
        },
      }),
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.patient.update.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({ archivedAt: null, birthDate: '1990-01-01' });
  });
  it('ya activo es idempotente y no altera timestamps ni identidad aunque la versión sea antigua', async () => {
    tx.patient.findUniqueOrThrow.mockResolvedValue({
      ...archived,
      archivedAt: null,
    });
    const result = await service.reactivate(user, 'patient', {
      expectedUpdatedAt: '2020-01-01T00:00:00Z',
    });
    expect(result.updatedAt).toEqual(archived.updatedAt);
    expect(tx.patient.update).not.toHaveBeenCalled();
  });
  it('rechaza versión obsoleta de un archivado sin reabrirlo ni modificarlo', async () => {
    await expect(
      service.reactivate(user, 'patient', {
        expectedUpdatedAt: '2020-01-01T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.patient.update).not.toHaveBeenCalled();
  });
  it('IDs ajenos o inexistentes no permiten leer ni modificar la fila', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service.reactivate(user, 'other', { expectedUpdatedAt: version }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.patient.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.patient.update).not.toHaveBeenCalled();
  });
  it.each([
    { ...user, role: 'ADMIN' },
    { ...user, status: 'INACTIVE' },
    { ...user, nutritionistProfile: null },
  ])('deniega cuenta sin acceso clínico: %j', async (account) => {
    await expect(
      service.reactivate(account as PublicUser, 'patient', {
        expectedUpdatedAt: version,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('archivar después de reactivar también avanza la versión, sin permitir ABA del timestamp', async () => {
    tx.patient.findUniqueOrThrow.mockResolvedValue({
      ...archived,
      archivedAt: null,
      updatedAt: new Date('2026-11-19T13:00:00.002Z'),
    });
    await service.archive(user, 'patient');
    expect(tx.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          archivedAt: new Date('2026-11-19T13:00:00.003Z'),
          updatedAt: new Date('2026-11-19T13:00:00.003Z'),
        },
      }),
    );
  });
});
