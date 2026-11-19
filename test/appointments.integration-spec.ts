import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { setupApp } from '../src/setup-app.js';
import { appointmentFixture } from './appointment-fixture.js';
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
  }),
  ids = [randomUUID(), randomUUID(), randomUUID()],
  profiles = [randomUUID(), randomUUID()];
describe('agenda con MySQL real y escrituras concurrentes', () => {
  let app: INestApplication,
    tokens: string[],
    patients: { id: string; updatedAt: Date }[];
  beforeAll(async () => {
    await db.$connect();
    const hash = await new PasswordService().hash(
      'synthetic-appointment-password',
    );
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
                  create: { id: profiles[i], displayName: 'Agenda ficticia' },
                },
              }
            : {}),
        },
      });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    tokens = [];
    for (const id of ids) {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({
          email: `${id}@example.invalid`,
          password: 'synthetic-appointment-password',
        })
        .expect(200);
      tokens.push(login.body.accessToken);
    }
  });
  beforeEach(async () => {
    patients = [];
    for (const nutritionistId of [profiles[0], profiles[0], profiles[1]])
      patients.push(
        await db.patient.create({
          data: {
            nutritionistId,
            fullName: 'Paciente agenda ficticio',
            birthDate: new Date('1990-01-01Z'),
          },
        }),
      );
  });
  afterEach(async () => {
    await db.appointmentMutation.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.appointment.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.patient.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
  });
  afterAll(async () => {
    if (app) await app.close();
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.nutritionistProfile.deleteMany({
      where: { id: { in: profiles } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  const auth = (i = 0) => ({ Authorization: `Bearer ${tokens[i]}` });
  const input = (i = 0) =>
    appointmentFixture(patients[i].id, patients[i].updatedAt.toISOString());
  const create = (body = input(), owner = 0) =>
    request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(auth(owner))
      .send(body);
  const status = (
    id: string,
    state: string,
    version: number,
    key = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/appointments/${id}/status`)
      .set(auth())
      .send({ status: state, expectedVersion: version, clientRequestId: key });
  it('persiste, pagina, filtra por periodo/estado y no crea consultas', async () => {
    const body = input(),
      res = await create(body).expect(201);
    expect(res.body).toMatchObject({
      patientId: body.patientId,
      startsAt: body.startsAt,
      status: 'scheduled',
      version: 1,
      timeZone: 'UTC',
    });
    const q = new URLSearchParams({
      from: body.startsAt,
      to: new Date(Date.parse(body.startsAt) + 86400000).toISOString(),
      pageSize: '1',
      search: 'agenda',
    });
    const list = await request(app.getHttpServer())
      .get(`/api/v1/appointments?${q}`)
      .set(auth())
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].id).toBe(res.body.id);
    await request(app.getHttpServer())
      .get(`/api/v1/appointments/${res.body.id}`)
      .set(auth())
      .expect(200);
    expect(
      await db.consultation.count({ where: { patientId: body.patientId } }),
    ).toBe(0);
    expect(res.body).not.toHaveProperty('nutritionistId');
    expect(res.body).not.toHaveProperty('requestHash');
  });
  it('serializa cruces simultáneos incluso entre pacientes distintos; permite citas contiguas', async () => {
    const a = input(),
      b = input(1),
      results = await Promise.all([create(a), create(b)]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const next = new Date(Date.parse(a.startsAt) + 3600000).toISOString();
    await create({
      ...input(),
      startsAt: next,
      localStartsAt: next.slice(0, 16),
    }).expect(201);
    expect(
      await db.appointment.count({ where: { nutritionistId: profiles[0] } }),
    ).toBe(2);
  });
  it('reintentos concurrentes y tras cancelación devuelven la operación original sin duplicar', async () => {
    const body = input(),
      [a, b] = await Promise.all([create(body), create(body)]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    await status(a.body.id, 'cancelled', 1).expect(200);
    const replay = await create(body).expect(201);
    expect(replay.body.status).toBe('scheduled');
    expect(replay.body.version).toBe(1);
    await create({ ...body, reason: 'Payload distinto' }).expect(409);
    expect(
      await db.appointment.count({ where: { nutritionistId: profiles[0] } }),
    ).toBe(1);
  });
  it('reprograma con versión, conserva registro y rechaza sobreescritura o cruce oculto', async () => {
    const body = input(),
      first = await create(body).expect(201),
      later = new Date(Date.parse(body.startsAt) + 7200000).toISOString();
    const { patientId: _id, patientUpdatedAt: _updated, ...capture } = body;
    const edit = {
      ...capture,
      clientRequestId: randomUUID(),
      startsAt: later,
      localStartsAt: later.slice(0, 16),
      expectedVersion: 1,
    };
    await request(app.getHttpServer())
      .patch(`/api/v1/appointments/${first.body.id}`)
      .set(auth())
      .send(edit)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/appointments/${first.body.id}`)
      .set(auth())
      .send({ ...edit, clientRequestId: randomUUID() })
      .expect(409);
    expect(
      await db.appointmentMutation.count({
        where: { appointmentId: first.body.id },
      }),
    ).toBe(2);
    await create({
      ...input(1),
      startsAt: later,
      localStartsAt: later.slice(0, 16),
    }).expect(409);
  });
  it('controla transiciones, marca asistencia solo desde inicio y no crea consulta', async () => {
    const res = await create().expect(201);
    await status(res.body.id, 'attended', 1).expect(409);
    await status(res.body.id, 'confirmed', 1).expect(200);
    await status(res.body.id, 'cancelled', 1).expect(409);
    await db.appointment.update({
      where: { id: res.body.id },
      data: {
        startsAt: new Date(Date.now() - 60000),
        endsAt: new Date(Date.now() + 3540000),
      },
    });
    const key = randomUUID();
    await status(res.body.id, 'attended', 2, key).expect(200);
    await status(res.body.id, 'attended', 2, key).expect(200);
    await status(res.body.id, 'cancelled', 3).expect(409);
    expect(
      await db.consultation.count({ where: { patientId: patients[0].id } }),
    ).toBe(0);
  });
  it('aísla propietarios y roles; ficha obsoleta y archivo no crean ni reprograman', async () => {
    const body = input();
    await create(body, 1).expect(404);
    await create(body, 2).expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(body)
      .expect(401);
    await create({ ...body, patientUpdatedAt: '2000-01-01T00:00:00Z' }).expect(
      409,
    );
    const own = await create(body).expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/appointments/${own.body.id}`)
      .set(auth(1))
      .expect(404);
    await db.patient.update({
      where: { id: patients[0].id },
      data: { archivedAt: new Date() },
    });
    await create({ ...body, clientRequestId: randomUUID() }).expect(409);
    await status(own.body.id, 'confirmed', 1).expect(409);
    await status(own.body.id, 'cancelled', 1).expect(200);
    await create(body).expect(201);
  });
});
