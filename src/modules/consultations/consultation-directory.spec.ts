import {
  directoryDayBoundary,
  directoryWhere,
} from './consultation-directory.js';
import { consultationDirectorySchema } from './consultations.schemas.js';
import { ConsultationsService } from './consultations.service.js';
import { PatientOwnershipService } from '../patients/patient-ownership.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import type { PrismaService } from '../../database/prisma.service.js';

describe('directorio general de consultas', () => {
  it('normaliza defaults y rechaza fechas inválidas, invertidas, arrays y campos extra', () => {
    expect(consultationDirectorySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      status: 'all',
      order: 'recent',
    });
    for (const input of [
      { fromDate: '2026-02-29' },
      { fromDate: '0999-01-01' },
      { search: ['x'] },
      { page: ['1', '2'] },
      { fromDate: '2026-11-02', toDate: '2026-11-01' },
      { nutritionistId: 'other' },
    ])
      expect(consultationDirectorySchema.safeParse(input).success).toBe(false);
  });
  it('incluye días completos de México con sus cambios históricos de horario', () => {
    expect(directoryDayBoundary('2026-11-19').toISOString()).toBe(
      '2026-11-19T06:00:00.000Z',
    );
    expect(directoryDayBoundary('2026-11-19', true).toISOString()).toBe(
      '2026-11-20T06:00:00.000Z',
    );
    expect(directoryDayBoundary('2021-07-01').toISOString()).toBe(
      '2021-07-01T05:00:00.000Z',
    );
    expect(
      directoryDayBoundary('2021-04-04', true).getTime() -
        directoryDayBoundary('2021-04-04').getTime(),
    ).toBe(23 * 3600000);
    expect(
      directoryDayBoundary('2021-10-31', true).getTime() -
        directoryDayBoundary('2021-10-31').getTime(),
    ).toBe(25 * 3600000);
    expect(directoryDayBoundary('9999-12-31', true).toISOString()).toBe(
      '+010000-01-01T06:00:00.000Z',
    );
  });
  it('aísla propietario y trata porcentajes, barras y guiones bajos como texto literal', () => {
    const where = directoryWhere(
      'owner',
      consultationDirectorySchema.parse({
        search: 'a%_\\',
        status: 'archived',
        fromDate: '2026-11-19',
        toDate: '2026-11-19',
      }),
    );
    expect(where).toMatchObject({
      nutritionistId: 'owner',
      patient: { nutritionistId: 'owner', archivedAt: { not: null } },
      occurredAt: {
        gte: new Date('2026-11-19T06:00:00Z'),
        lt: new Date('2026-11-20T06:00:00Z'),
      },
    });
    expect(where.OR).toEqual([
      { reason: { contains: 'a\\%\\_\\\\' } },
      { id: { contains: 'a\\%\\_\\\\' } },
      { patientId: { contains: 'a\\%\\_\\\\' } },
      { patient: { fullName: { contains: 'a\\%\\_\\\\' } } },
    ]);
  });
  it.each(['recent', 'oldest', 'patient'])(
    'pagina y cuenta el mismo conjunto filtrado, sin captura pesada: %s',
    async (order) => {
      const tx = {
        consultation: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(3),
        },
        patient: { count: vi.fn().mockResolvedValue(4) },
      };
      const transaction = vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      );
      const service = new ConsultationsService(
        { $transaction: transaction } as unknown as PrismaService,
        new PatientOwnershipService(),
      );
      const query = consultationDirectorySchema.parse({
        page: '2',
        pageSize: '5',
        search: 'Demo',
        order,
      });
      const result = await service.directory(
        {
          role: 'NUTRITIONIST',
          status: 'ACTIVE',
          nutritionistProfile: { id: 'owner' },
        } as PublicUser,
        query,
      );
      expect(result).toEqual({
        data: [],
        meta: { page: 2, pageSize: 5, total: 12 },
        summary: { patients: 4, archivedConsultations: 3 },
      });
      const args = tx.consultation.findMany.mock.calls[0][0];
      expect(args).toMatchObject({
        skip: 5,
        take: 5,
        where: directoryWhere('owner', query),
      });
      expect(args.select).toEqual({
        id: true,
        patientId: true,
        occurredAt: true,
        reason: true,
        patient: { select: { fullName: true, archivedAt: true } },
      });
      expect(args.orderBy).toEqual(
        order === 'patient'
          ? [
              { patient: { fullName: 'asc' } },
              { occurredAt: 'desc' },
              { id: 'asc' },
            ]
          : [
              { occurredAt: order === 'oldest' ? 'asc' : 'desc' },
              { id: 'asc' },
            ],
      );
      expect(tx.consultation.count).toHaveBeenNthCalledWith(1, {
        where: args.where,
      });
      expect(tx.patient.count).toHaveBeenCalledWith({
        where: { nutritionistId: 'owner', consultations: { some: args.where } },
      });
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
    },
  );
});
