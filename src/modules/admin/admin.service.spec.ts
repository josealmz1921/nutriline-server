import { AdminService } from './admin.service.js';
import {
  accountStatusSchema,
  auditListSchema,
  paymentListSchema,
} from './admin.schemas.js';
import type { PublicUser } from '../auth/auth.types.js';
import type { PrismaService } from '../../database/prisma.service.js';

describe('control administrativo de solo lectura', () => {
  const setup = () => {
    const db = {
      billingPayment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      nutritionistProfile: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn((operations) => Promise.all(operations)),
    };
    return { db, service: new AdminService(db as unknown as PrismaService) };
  };
  it('filtra pagos por dueño, proveedor, estado y días UTC sin agregar monedas', async () => {
    const { db, service } = setup();
    const result = await service.payments({
      page: 1,
      pageSize: 10,
      nutritionistId: 'owner',
      provider: 'ADYEN',
      status: 'FAILED',
      from: '2026-11-01',
      to: '2026-11-02',
    });
    expect(db.billingPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          nutritionistId: 'owner',
          provider: 'ADYEN',
          status: 'FAILED',
          createdAt: {
            gte: new Date('2026-11-01T00:00:00Z'),
            lt: new Date('2026-11-03T00:00:00Z'),
          },
        },
      }),
    );
    expect(result).not.toHaveProperty('totalAmount');
  });
  it('directorio no expone hashes de contraseña, sesiones ni pacientes', async () => {
    const { db, service } = setup();
    await service.nutritionists({ page: 1, pageSize: 10, search: 'test%' });
    const select = db.nutritionistProfile.findMany.mock.calls[0][0].select;
    expect(select.user).toEqual({ select: { email: true, status: true } });
    expect(select).not.toHaveProperty('patients');
  });
  it('rechaza rangos inválidos, proveedores desconocidos y campos fuera de contrato', () => {
    for (const input of [
      { from: '2026-12-01', to: '2026-11-01' },
      { provider: 'OTHER' },
      { paid: true },
      { pageSize: 100 },
    ])
      expect(paymentListSchema.safeParse(input).success).toBe(false);
  });
  it('exige motivo, estado esperado y filtros de auditoría válidos', () => {
    expect(
      accountStatusSchema.safeParse({ status: 'INACTIVE', reason: 'ok' })
        .success,
    ).toBe(false);
    expect(
      accountStatusSchema.safeParse({
        status: 'INACTIVE',
        expectedStatus: 'ACTIVE',
        reason: 'Motivo válido',
        role: 'ADMIN',
      }).success,
    ).toBe(false);
    expect(auditListSchema.safeParse({ userId: 'otro' }).success).toBe(false);
    expect(auditListSchema.safeParse({ action: 'DELETE' }).success).toBe(false);
    expect(
      auditListSchema.safeParse({ from: '2026-12-01', to: '2026-11-01' })
        .success,
    ).toBe(false);
  });
  it('bloqueo y bitácora usan una transacción con bloqueo por usuario', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { id: 'target', role: 'NUTRITIONIST', status: 'ACTIVE' },
        ]),
      user: {
        update: vi.fn().mockResolvedValue({ id: 'target', status: 'INACTIVE' }),
      },
      authSession: { updateMany: vi.fn() },
      passwordReset: { updateMany: vi.fn() },
      adminAccountEvent: { create: vi.fn() },
    };
    const db = { $transaction: vi.fn((callback) => callback(tx)) };
    const service = new AdminService(db as unknown as PrismaService);
    const actor = { id: 'admin', role: 'ADMIN' } as PublicUser;
    const input = {
      status: 'INACTIVE' as const,
      expectedStatus: 'ACTIVE' as const,
      reason: 'Incumplimiento',
    };
    await service.setStatus(actor, 'target', input);
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.adminAccountEvent.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin',
        userId: 'target',
        reason: input.reason,
        action: 'BLOCKED',
      },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.update.mock.invocationCallOrder[0],
    );
    await expect(service.setStatus(actor, 'admin', input)).rejects.toThrow(
      'propia cuenta',
    );
    tx.$queryRaw.mockResolvedValue([
      { id: 'target', role: 'ADMIN', status: 'ACTIVE' },
    ]);
    await expect(service.setStatus(actor, 'target', input)).rejects.toThrow(
      'administradoras',
    );
    tx.$queryRaw.mockResolvedValue([
      { id: 'target', role: 'NUTRITIONIST', status: 'INACTIVE' },
    ]);
    await expect(service.setStatus(actor, 'target', input)).rejects.toThrow(
      'cambió',
    );
    expect(tx.adminAccountEvent.create).toHaveBeenCalledOnce();
  });
});
