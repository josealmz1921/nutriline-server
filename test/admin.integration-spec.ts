import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { setupApp } from '../src/setup-app.js';

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
const ids = [randomUUID(), randomUUID()];
const profileId = randomUUID();
const password = 'synthetic-admin-test-password';
const emails = ids.map((id) => `${id}@example.invalid`);
describe('administración y bitácora con MySQL real', () => {
  let app: INestApplication;
  let adminToken: string;
  let ownerToken: string;
  let refreshCookie: string;
  beforeAll(async () => {
    await db.$connect();
    const passwordHash = await new PasswordService().hash(password);
    await db.user.create({
      data: { id: ids[0], email: emails[0], role: 'ADMIN', passwordHash },
    });
    await db.user.create({
      data: {
        id: ids[1],
        email: emails[1],
        role: 'NUTRITIONIST',
        passwordHash,
        nutritionistProfile: {
          create: { id: profileId, displayName: 'Usuario de prueba admin' },
        },
      },
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    adminToken = (await login(0).expect(200)).body.accessToken;
    const response = await login(1).expect(200);
    ownerToken = response.body.accessToken;
    refreshCookie = (
      response.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
  });
  afterAll(async () => {
    if (app) await app.close();
    const tickets = await db.supportTicket.findMany({
      where: { nutritionistId: profileId },
      select: { id: true },
    });
    const ticketId = { in: tickets.map((t) => t.id) };
    await db.supportEvent.deleteMany({ where: { ticketId } });
    await db.supportMessage.deleteMany({ where: { ticketId } });
    await db.supportTicket.deleteMany({ where: { nutritionistId: profileId } });
    await db.adminAccountEvent.deleteMany({ where: { userId: { in: ids } } });
    await db.passwordReset.deleteMany({ where: { userId: { in: ids } } });
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.nutritionistProfile.deleteMany({ where: { id: profileId } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  const login = (index: number) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: emails[index], password });
  const status = (
    token: string,
    id: string,
    expectedStatus: string,
    next: string,
  ) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedStatus,
        status: next,
        reason: 'Motivo sintético de prueba',
      });
  it('restringe rutas y no entrega credenciales ni datos clínicos', async () => {
    for (const path of [
      '/admin/users',
      `/admin/users/${ids[1]}`,
      '/admin/audit',
    ]) {
      await request(app.getHttpServer()).get(`/api/v1${path}`).expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    }
    await status(ownerToken, ids[1], 'ACTIVE', 'INACTIVE').expect(403);
    await status(adminToken, ids[0], 'ACTIVE', 'INACTIVE').expect(403);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${ids[1]}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body).not.toHaveProperty('passwordHash');
    expect(detail.body).not.toHaveProperty('sessions');
    expect(detail.body).not.toHaveProperty('patients');
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit?from=2026-12-01&to=2026-11-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
  it('bloquea, revoca sesiones y recuperación, desbloquea sin revivir tokens y conserva la bitácora', async () => {
    await db.passwordReset.create({
      data: {
        userId: ids[1],
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const ticket = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        clientRequestId: randomUUID(),
        subject: 'Ticket de auditoría',
        category: 'QUESTION',
        body: 'Texto privado no incluido en bitácora.',
      })
      .expect(201);
    await status(adminToken, ids[1], 'ACTIVE', 'INACTIVE').expect(200);
    expect(
      await db.authSession.count({
        where: { userId: ids[1], revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await db.passwordReset.count({ where: { userId: ids[1], usedAt: null } }),
    ).toBe(0);
    await login(1).expect(401);
    await status(adminToken, ids[1], 'ACTIVE', 'INACTIVE').expect(409);
    await status(adminToken, ids[1], 'INACTIVE', 'ACTIVE').expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', refreshCookie)
      .expect(401);
    await login(1).expect(200);
    const audit = await request(app.getHttpServer())
      .get(`/api/v1/admin/audit?userId=${ids[1]}&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(audit.body.meta.total).toBe(3);
    expect(audit.body.data).toHaveLength(1);
    const history = await request(app.getHttpServer())
      .get(`/api/v1/admin/audit?userId=${ids[1]}&action=CREATED`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(history.body.data[0].ticketId).toBe(ticket.body.id);
    expect(JSON.stringify(history.body)).not.toContain('Texto privado');
    const blocked = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/audit?userId=${ids[1]}&action=BLOCKED&from=2000-01-01&to=2099-12-31`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(blocked.body.meta.total).toBe(1);
    expect(blocked.body.data[0].actorId).toBe(ids[0]);
    expect(blocked.body.data[0].reason).toBe('Motivo sintético de prueba');
  });
});
