import { randomUUID } from 'node:crypto';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { SupportService } from '../src/modules/support/support.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { PublicUser } from '../src/modules/auth/auth.types.js';

const connection = process.env.DATABASE_URL;
if (
  !connection ||
  new URL(connection).pathname !== '/nutriline_test' ||
  process.env.NODE_ENV !== 'test'
)
  throw new Error('Solo base aislada nutriline_test');
const db = new PrismaClient({
  adapter: new PrismaMariaDb(connection),
  log: [],
});
const service = new SupportService(db as PrismaService);
const ids = [randomUUID(), randomUUID()];
const profileId = randomUUID();
const owner: PublicUser = {
  id: ids[0],
  email: `${ids[0]}@example.invalid`,
  role: 'NUTRITIONIST',
  status: 'ACTIVE',
  nutritionistProfile: {
    id: profileId,
    displayName: 'Soporte ficticio',
    timezone: 'America/Mexico_City',
  },
};
const admin: PublicUser = {
  id: ids[1],
  email: `${ids[1]}@example.invalid`,
  role: 'ADMIN',
  status: 'ACTIVE',
  nutritionistProfile: null,
};
describe('límite de soporte con MySQL real', () => {
  beforeAll(async () => {
    await db.$connect();
    await db.user.create({
      data: {
        id: owner.id,
        email: owner.email,
        passwordHash: 'not-used-in-test',
        role: 'NUTRITIONIST',
        nutritionistProfile: {
          create: { id: profileId, displayName: 'Soporte ficticio' },
        },
      },
    });
    await db.user.create({
      data: {
        id: admin.id,
        email: admin.email,
        passwordHash: 'not-used-in-test',
        role: 'ADMIN',
      },
    });
  });
  afterAll(async () => {
    const tickets = await db.supportTicket.findMany({
      where: { nutritionistId: profileId },
      select: { id: true },
    });
    const ticketIds = tickets.map((t) => t.id);
    await db.supportEvent.deleteMany({
      where: { ticketId: { in: ticketIds } },
    });
    await db.supportMessage.deleteMany({
      where: { ticketId: { in: ticketIds } },
    });
    await db.supportTicket.deleteMany({ where: { nutritionistId: profileId } });
    await db.nutritionistProfile.deleteMany({ where: { id: profileId } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it('seis peticiones simultáneas solo crean tres activos; cerrar libera lugar y admin puede exceder', async () => {
    const inputs = Array.from({ length: 6 }, (_, i) => ({
      clientRequestId: randomUUID(),
      subject: `Ticket ficticio ${i}`,
      category: 'QUESTION' as const,
      body: 'Prueba de concurrencia aislada.',
    }));
    const results = await Promise.allSettled(
      inputs.map((input) => service.create(owner, input)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(
      await db.supportTicket.count({ where: { nutritionistId: profileId } }),
    ).toBe(3);
    const successful = results.findIndex((r) => r.status === 'fulfilled');
    await service.create(owner, inputs[successful]);
    expect(
      await db.supportTicket.count({ where: { nutritionistId: profileId } }),
    ).toBe(3);
    const first = await db.supportTicket.findFirstOrThrow({
      where: { nutritionistId: profileId },
    });
    await service.change(owner, first.id, {
      expectedVersion: first.version,
      status: 'CLOSED',
    });
    await service.create(owner, {
      ...inputs[0],
      clientRequestId: randomUUID(),
    });
    await service.create(
      admin,
      { ...inputs[0], clientRequestId: randomUUID() },
      profileId,
    );
    expect(
      await db.supportTicket.count({
        where: { nutritionistId: profileId, status: 'OPEN' },
      }),
    ).toBe(4);
    const open = await db.supportTicket.findFirstOrThrow({
      where: { nutritionistId: profileId, status: 'OPEN' },
    });
    await service.reply(owner, open.id, {
      clientRequestId: randomUUID(),
      body: 'Responder sigue permitido.',
    });
    expect(
      await db.supportEvent.count({
        where: { ticketId: first.id, action: 'UPDATED' },
      }),
    ).toBe(1);
  });
});
