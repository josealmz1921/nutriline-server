import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { setupApp } from '../src/setup-app.js';
import { menuFixture } from './menu-fixture.js';
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
const ids = [randomUUID(), randomUUID(), randomUUID()],
  profiles = [randomUUID(), randomUUID()];
describe('menús persistidos, MySQL real', () => {
  let app: INestApplication,
    tokens: string[],
    patient: { id: string; updatedAt: Date };
  beforeAll(async () => {
    await db.$connect();
    const hash = await new PasswordService().hash('synthetic-menu-password');
    for (const [i, id] of ids.entries())
      await db.user.create({
        data: {
          id,
          email: `${id}@example.invalid`,
          passwordHash: hash,
          role: i === 2 ? 'ADMIN' : 'NUTRITIONIST',
          ...(i < 2
            ? {
                nutritionistProfile: {
                  create: {
                    id: profiles[i],
                    displayName: 'Profesional histórico ficticio',
                  },
                },
              }
            : {}),
        },
      });
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    tokens = [];
    for (const id of ids) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({
          email: `${id}@example.invalid`,
          password: 'synthetic-menu-password',
        })
        .expect(200);
      tokens.push(res.body.accessToken);
    }
  });
  beforeEach(async () => {
    patient = await db.patient.create({
      data: {
        nutritionistId: profiles[0],
        fullName: 'Paciente histórico ficticio',
        birthDate: new Date('1990-01-01Z'),
      },
    });
  });
  afterAll(async () => {
    if (app) await app.close();
    await db.dailyMenuRevision.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.dailyMenu.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.patient.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.nutritionistProfile.deleteMany({
      where: { id: { in: profiles } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  const auth = (i = 0) => ({ Authorization: `Bearer ${tokens[i]}` });
  it('persiste ingredientes v3 y conserva su instantánea al editar cantidades', async () => {
    const legacy = menuFixture(patient.updatedAt.toISOString());
    const input = {
      ...legacy,
      schemaVersion: 3,
      menu: {
        ...legacy.menu,
        meals: {
          custom: {
            ...legacy.menu.meals.breakfast,
            label: 'Mi tiempo',
            preparations: [
              {
                ...legacy.menu.meals.breakfast.preparations[0],
                ingredients: [
                  {
                    catalogId: '1231',
                    catalogVersion: 'legacy-foods-2176-v1',
                    name: 'Manzana',
                    quantity: '0,5',
                    unit: 'pieza',
                  },
                ],
              },
            ],
          },
        },
      },
    };
    const saved = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patient.id}/menus`)
      .set(auth())
      .send(input)
      .expect(201);
    expect(saved.body.schemaVersion).toBe(3);
    expect(saved.body.menu).toEqual(input.menu);
    const edited = {
      ...structuredClone(input),
      clientRequestId: randomUUID(),
      expectedRevision: 1,
    };
    edited.menu.meals.custom.preparations[0].ingredients[0].quantity = '2';
    await request(app.getHttpServer())
      .patch(`/api/v1/menus/${saved.body.id}`)
      .set(auth())
      .send(edited)
      .expect(200);
    const historical = await request(app.getHttpServer())
      .get(`/api/v1/menus/${saved.body.id}/revisions/1`)
      .set(auth())
      .expect(200);
    expect(
      historical.body.menu.meals.custom.preparations[0].ingredients[0].quantity,
    ).toBe('0,5');
    const current = await request(app.getHttpServer())
      .get(`/api/v1/menus/${saved.body.id}`)
      .set(auth())
      .expect(200);
    expect(
      current.body.menu.meals.custom.preparations[0].ingredients[0].quantity,
    ).toBe('2');
  });
  const create = (
    input = menuFixture(patient.updatedAt.toISOString()),
    index = 0,
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/patients/${patient.id}/menus`)
      .set(auth(index))
      .send(input);
  it('persiste captura completa, no crea consulta y relee instantáneas históricas', async () => {
    const input = menuFixture(patient.updatedAt.toISOString()),
      res = await create(input).expect(201);
    expect(res.body.menu).toEqual(input.menu);
    expect(res.body.revision).toBe(1);
    expect(res.body).not.toHaveProperty('clientRequestId');
    expect(res.body).not.toHaveProperty('requestHash');
    await db.patient.update({
      where: { id: patient.id },
      data: { fullName: 'Nombre actual diferente' },
    });
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/menus/${res.body.id}`)
      .set(auth())
      .expect(200);
    expect(detail.body.patientSnapshot.fullName).toBe(
      'Paciente histórico ficticio',
    );
    expect(detail.body.menu).toEqual(input.menu);
    expect(
      await db.consultation.count({ where: { patientId: patient.id } }),
    ).toBe(0);
    const list = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patient.id}/menus?pageSize=1`)
      .set(auth())
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).not.toHaveProperty('menu');
  });
  it('edita con control de revisión, conserva historia y no permite dos ediciones simultáneas', async () => {
    const res = await create().expect(201),
      body = {
        ...menuFixture(patient.updatedAt.toISOString()),
        expectedRevision: 1,
      };
    body.menu.recommendations = 'Revisión nueva';
    const patch = (b: typeof body) =>
      request(app.getHttpServer())
        .patch(`/api/v1/menus/${res.body.id}`)
        .set(auth())
        .send(b);
    const attempts = await Promise.all([
      patch(body),
      patch({ ...body, clientRequestId: randomUUID() }),
    ]);
    expect(attempts.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const historical = await request(app.getHttpServer())
      .get(`/api/v1/menus/${res.body.id}/revisions/1`)
      .set(auth())
      .expect(200);
    expect(historical.body.menu).toEqual(res.body.menu);
    expect(historical.body.currentRevision).toBe(2);
    expect(
      await db.dailyMenuRevision.count({ where: { menuId: res.body.id } }),
    ).toBe(2);
  });
  it('guarda tiempos libres como v2 y conserva intacta la revisión histórica v1', async () => {
    const original = await create().expect(201);
    const legacy = menuFixture(patient.updatedAt.toISOString());
    const input = {
      ...legacy,
      schemaVersion: 2,
      expectedRevision: 1,
      menu: {
        ...legacy.menu,
        meals: {
          training: {
            ...legacy.menu.meals.breakfast,
            label: 'Después de entrenar',
          },
        },
      },
    };
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/menus/${original.body.id}`)
      .set(auth())
      .send(input)
      .expect(200);
    expect(updated.body.schemaVersion).toBe(2);
    expect(updated.body.menu).toEqual(input.menu);
    const reread = await request(app.getHttpServer())
      .get(`/api/v1/menus/${original.body.id}`)
      .set(auth())
      .expect(200);
    expect(reread.body.menu.meals.training.label).toBe('Después de entrenar');
    const historical = await request(app.getHttpServer())
      .get(`/api/v1/menus/${original.body.id}/revisions/1`)
      .set(auth())
      .expect(200);
    expect(historical.body.schemaVersion).toBe(1);
    expect(historical.body.menu).toEqual(original.body.menu);
    const replay = await request(app.getHttpServer())
      .patch(`/api/v1/menus/${original.body.id}`)
      .set(auth())
      .send(input)
      .expect(200);
    expect(replay.body.revision).toBe(2);
  });
  it('reintentos concurrentes y tras archivo devuelven la misma revisión sin duplicar', async () => {
    const input = menuFixture(patient.updatedAt.toISOString());
    const [a, b] = await Promise.all([create(input), create(input)]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    await db.patient.update({
      where: { id: patient.id },
      data: { archivedAt: new Date() },
    });
    const replay = await create(input).expect(201);
    expect(replay.body.revision).toBe(1);
    expect(replay.body.menu).toEqual(input.menu);
    await create({ ...input, clientRequestId: randomUUID() }).expect(409);
    await create({
      ...input,
      menu: { ...input.menu, recommendations: 'Alterado' },
    }).expect(409);
    expect(await db.dailyMenu.count({ where: { patientId: patient.id } })).toBe(
      1,
    );
  });
  it('aísla propietarios, exige sesión/rol y rechaza ficha obsoleta sin escribir', async () => {
    const input = menuFixture(patient.updatedAt.toISOString());
    await create(input, 1).expect(404);
    await create(input, 2).expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patient.id}/menus`)
      .send(input)
      .expect(401);
    await create({
      ...input,
      patientUpdatedAt: '2000-01-01T00:00:00.000Z',
    }).expect(409);
    expect(await db.dailyMenu.count({ where: { patientId: patient.id } })).toBe(
      0,
    );
    const res = await create(input).expect(201);
    for (const path of [
      `/menus/${res.body.id}`,
      `/menus/${res.body.id}/revisions/1`,
      `/patients/${patient.id}/menus`,
    ])
      await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .set(auth(1))
        .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/menus/${res.body.id}`)
      .set(auth(1))
      .send({ ...input, expectedRevision: 1 })
      .expect(404);
  });
  it('reintenta edición con la misma referencia incluso después de una revisión posterior', async () => {
    const first = await create().expect(201),
      input = {
        ...menuFixture(patient.updatedAt.toISOString()),
        expectedRevision: 1,
      };
    const patch = (body: typeof input) =>
      request(app.getHttpServer())
        .patch(`/api/v1/menus/${first.body.id}`)
        .set(auth())
        .send(body);
    const second = await patch(input).expect(200);
    await patch({
      ...input,
      clientRequestId: randomUUID(),
      expectedRevision: 2,
      menu: { ...input.menu, recommendations: 'Tercera revisión' },
    }).expect(200);
    const replay = await patch(input).expect(200);
    expect(replay.body.revision).toBe(2);
    expect(replay.body.menu).toEqual(second.body.menu);
    expect(replay.body.currentRevision).toBe(3);
  });
});
