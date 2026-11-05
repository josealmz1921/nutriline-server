import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDemo } from '../src/demo/seed-demo.js';

const connection = process.env.DATABASE_URL;
if (
  !connection ||
  new URL(connection).pathname !== '/nutriline_test' ||
  process.env.NODE_ENV !== 'test'
) {
  throw new Error(
    'Integración requiere NODE_ENV=test y base exclusiva nutriline_test',
  );
}
const db = new PrismaClient({
  adapter: new PrismaMariaDb(connection),
  log: [],
});
const ids = [1, 2, 3].map((id) => `10000000-0000-4000-8000-00000000000${id}`);

describe('seed sintético idempotente', () => {
  beforeAll(async () => {
    await db.$connect();
  });
  afterAll(async () => {
    const profiles = await db.nutritionistProfile.findMany({
      where: { userId: { in: ids } },
      select: { id: true },
    });
    await db.patient.deleteMany({
      where: { nutritionistId: { in: profiles.map((profile) => profile.id) } },
    });
    await db.nutritionistProfile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it('crea ADMIN y dos NUTRITIONIST sin duplicar ni resetear cuentas existentes', async () => {
    const env = {
      NODE_ENV: 'test',
      DEMO_MODE: 'true',
      DATABASE_URL: connection,
      DEMO_PASSWORD: 'synthetic-seed-password',
    };
    await seedDemo(db, env);
    const original = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(original.passwordHash).toMatch(/^\$argon2id\$/);
    await db.user.update({
      where: { id: ids[0] },
      data: { status: 'INACTIVE' },
    });
    await seedDemo(db, { ...env, DEMO_PASSWORD: 'changed-seed-password' });
    const after = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(after.passwordHash).toBe(original.passwordHash);
    expect(after.status).toBe('INACTIVE');
    expect(
      await db.user.count({ where: { id: { in: ids }, role: 'ADMIN' } }),
    ).toBe(1);
    expect(
      await db.user.count({ where: { id: { in: ids }, role: 'NUTRITIONIST' } }),
    ).toBe(2);
    expect(
      await db.patient.count({
        where: { nutritionist: { userId: { in: ids } } },
      }),
    ).toBe(2);
  });
});
