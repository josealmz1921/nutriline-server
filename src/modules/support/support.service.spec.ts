import { randomUUID } from 'node:crypto';
import { SupportService } from './support.service.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import {
  activeStatuses,
  createTicketSchema,
  changeTicketSchema,
  ticketListSchema,
} from './support.schemas.js';

const owner: PublicUser = {
  id: randomUUID(),
  email: 'owner@example.invalid',
  role: 'NUTRITIONIST',
  status: 'ACTIVE',
  nutritionistProfile: {
    id: randomUUID(),
    displayName: 'Prueba',
    timezone: 'America/Mexico_City',
  },
};
const admin: PublicUser = {
  ...owner,
  id: randomUUID(),
  role: 'ADMIN',
  nutritionistProfile: null,
};
const input = () => ({
  clientRequestId: randomUUID(),
  subject: 'Error ficticio',
  category: 'ERROR' as const,
  body: 'No puedo ver un botón.',
});
function setup() {
  const row = {
    id: randomUUID(),
    nutritionistId: owner.nutritionistProfile!.id,
    requestHash: '',
    clientRequestId: '',
    status: 'OPEN',
    priority: 'NORMAL',
    assignedToId: null,
    version: 1,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: row.nutritionistId }]),
    supportTicket: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => ({ ...row })),
      create: vi
        .fn()
        .mockImplementation(async ({ data }) => ({ ...row, ...data })),
      update: vi
        .fn()
        .mockImplementation(async ({ data }) => ({
          ...row,
          ...data,
          version: row.version + 1,
        })),
    },
    supportMessage: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: randomUUID() }),
    },
    supportEvent: { create: vi.fn().mockResolvedValue({}) },
    billingPayment: { findFirst: vi.fn().mockResolvedValue(null) },
    user: { findFirst: vi.fn().mockResolvedValue({ id: admin.id }) },
  };
  const db = {
    ...tx,
    supportTicket: {
      ...tx.supportTicket,
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (operation) =>
      typeof operation === 'function' ? operation(tx) : Promise.all(operation),
    ),
  };
  return {
    row,
    tx,
    db,
    service: new SupportService(db as unknown as PrismaService),
  };
}
describe('soporte con límite por propietario', () => {
  it('bloquea el perfil antes de contar y rechaza el cuarto ticket activo', async () => {
    const { service, tx } = setup();
    tx.supportTicket.count.mockResolvedValue(3);
    await expect(service.create(owner, input())).rejects.toThrow(
      '3 tickets activos',
    );
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.supportTicket.count.mock.invocationCallOrder[0],
    );
    expect(tx.supportTicket.count).toHaveBeenCalledWith({
      where: {
        nutritionistId: owner.nutritionistProfile!.id,
        status: { in: [...activeStatuses] },
      },
    });
    expect(tx.supportTicket.create).not.toHaveBeenCalled();
  });
  it('crea mensaje y bitácora juntos y permite excepciones explícitas del admin', async () => {
    const { service, tx } = setup();
    tx.supportTicket.count.mockResolvedValue(10);
    await service.create(admin, input(), owner.nutritionistProfile!.id);
    expect(tx.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          events: {
            create: {
              actorId: admin.id,
              action: 'CREATED',
              details: { adminOverride: true },
            },
          },
          messages: { create: expect.objectContaining({ authorId: admin.id }) },
        }),
      }),
    );
    expect(tx.supportTicket.count).not.toHaveBeenCalled();
  });
  it('un reintento idéntico no crea otro ticket aunque ya se haya alcanzado el límite', async () => {
    const { service, tx } = setup();
    const body = input();
    const first = await service.create(owner, body);
    const stored = tx.supportTicket.create.mock.calls[0][0].data;
    tx.supportTicket.findUnique.mockResolvedValue({ ...stored, id: first.id });
    tx.supportTicket.count.mockResolvedValue(3);
    await expect(service.create(owner, body)).resolves.toMatchObject({
      id: first.id,
    });
    expect(tx.supportTicket.create).toHaveBeenCalledOnce();
    await expect(
      service.create(owner, { ...body, body: 'Contenido cambiado' }),
    ).rejects.toThrow('otro contenido');
    expect(first).not.toHaveProperty('requestHash');
  });
  it('no permite asociar un pago de otra cuenta', async () => {
    const { service, tx } = setup();
    await expect(
      service.create(owner, { ...input(), paymentId: randomUUID() }),
    ).rejects.toThrow('Pago no encontrado');
    expect(tx.supportTicket.create).not.toHaveBeenCalled();
  });
  it('no permite leer, responder ni cambiar tickets ajenos', async () => {
    const { service, db } = setup();
    db.supportTicket.findFirst.mockResolvedValue(null);
    await expect(service.detail(owner, randomUUID())).rejects.toThrow(
      'Ticket no encontrado',
    );
    await expect(
      service.reply(owner, randomUUID(), {
        clientRequestId: randomUUID(),
        body: 'Respuesta',
      }),
    ).rejects.toThrow('Ticket no encontrado');
    expect(db.supportTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          nutritionistId: owner.nutritionistProfile!.id,
        }),
      }),
    );
  });
  it('responder sigue permitido con tres tickets activos pero no en tickets finalizados', async () => {
    const { service, tx, row } = setup();
    tx.supportTicket.count.mockResolvedValue(3);
    await service.reply(owner, row.id, {
      clientRequestId: randomUUID(),
      body: 'Seguimiento',
    });
    expect(tx.supportMessage.create).toHaveBeenCalledOnce();
    row.status = 'RESOLVED';
    await expect(
      service.reply(owner, row.id, {
        clientRequestId: randomUUID(),
        body: 'Otro seguimiento',
      }),
    ).rejects.toThrow('resuelto o cerrado');
  });
  it('protege cambios obsoletos y registra cierre en la misma transacción', async () => {
    const { service, tx, row } = setup();
    await expect(
      service.change(owner, row.id, { expectedVersion: 2, status: 'CLOSED' }),
    ).rejects.toThrow('cambió');
    expect(tx.supportTicket.update).not.toHaveBeenCalled();
    await service.change(owner, row.id, {
      expectedVersion: 1,
      status: 'CLOSED',
    });
    expect(tx.supportEvent.create).toHaveBeenCalledOnce();
    await expect(
      service.change(owner, row.id, { expectedVersion: 1, status: 'OPEN' }),
    ).rejects.toThrow('Solo puedes cerrar');
  });
  it('la lista siempre fuerza la cuenta propia y no se filtra el contador activo por estado visible', async () => {
    const { service, db } = setup();
    await service.list(owner, {
      page: 1,
      pageSize: 10,
      nutritionistId: randomUUID(),
      status: 'CLOSED',
    });
    expect(db.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          nutritionistId: owner.nutritionistProfile!.id,
          status: 'CLOSED',
        },
      }),
    );
    expect(db.supportTicket.count).toHaveBeenLastCalledWith({
      where: {
        nutritionistId: owner.nutritionistProfile!.id,
        status: { in: [...activeStatuses] },
      },
    });
  });
  it('valida contratos, no admite roles ni prioridades enviados al crear', () => {
    expect(
      createTicketSchema.safeParse({ ...input(), priority: 'URGENT' }).success,
    ).toBe(false);
    expect(
      createTicketSchema.safeParse({ ...input(), body: 'x'.repeat(4001) })
        .success,
    ).toBe(false);
    expect(changeTicketSchema.safeParse({ expectedVersion: 1 }).success).toBe(
      false,
    );
    expect(ticketListSchema.safeParse({ pageSize: 51 }).success).toBe(false);
  });
});
