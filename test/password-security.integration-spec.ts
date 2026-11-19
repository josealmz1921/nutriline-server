import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { PasswordSecurityService } from '../src/modules/auth/password-security.service.js';
import { RecoveryMailer } from '../src/modules/auth/recovery-mailer.service.js';
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
  }),
  oldPassword = 'contraseña-anterior-ficticia',
  nextPassword = 'contraseña-nueva-ficticia',
  origin = 'http://localhost:3000';
describe('seguridad de contraseñas con MySQL real', () => {
  let app: INestApplication, id: string, email: string;
  const mail = { send: vi.fn().mockResolvedValue(undefined) };
  beforeAll(async () => {
    await db.$connect();
  });
  beforeEach(async () => {
    mail.send.mockReset().mockResolvedValue(undefined);
    id = randomUUID();
    email = `${id}@example.invalid`;
    await db.user.create({
      data: {
        id,
        email,
        passwordHash: await new PasswordService().hash(oldPassword),
        role: 'NUTRITIONIST',
      },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RecoveryMailer)
      .useValue(mail)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    app.get(ConfigService).set('MAIL_MODE', 'smtp');
    app.get(ConfigService).set('PASSWORD_RESET_ORIGIN', origin);
  });
  afterEach(async () => {
    await app.close();
    await db.passwordReset.deleteMany({ where: { userId: id } });
    await db.authSession.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  const login = (password = oldPassword) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password });
  const forgot = (target = email) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/password/forgot')
      .set('Origin', origin)
      .send({ email: target });
  const reset = (token: string, newPassword = nextPassword) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .set('Origin', origin)
      .send({ token, newPassword });
  const tokenFromMail = () =>
    new URLSearchParams(
      new URL(String(mail.send.mock.calls[0][1])).hash.slice(1),
    ).get('token')!;
  const deliveredToken = async () => {
    await forgot().expect(200);
    await app.get(PasswordSecurityService).deliverPending();
    return tokenFromMail();
  };
  it('responde igual a cuentas activas, ausentes e inactivas; cola cifrada y enlace solo por correo', async () => {
    const active = await forgot().expect(200),
      absent = await forgot('absent@example.invalid').expect(200);
    await db.user.update({ where: { id }, data: { status: 'INACTIVE' } });
    const inactive = await forgot().expect(200);
    expect(active.body).toEqual(absent.body);
    expect(active.body).toEqual(inactive.body);
    expect(active.body).not.toHaveProperty('token');
    expect(mail.send).not.toHaveBeenCalled();
    const row = await db.passwordReset.findFirstOrThrow({
      where: { userId: id },
    });
    expect(row.deliveryPayload).toBeTruthy();
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    await db.user.update({ where: { id }, data: { status: 'ACTIVE' } });
    await app.get(PasswordSecurityService).deliverPending();
    const token = tokenFromMail();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.deliveryPayload).not.toContain(token);
    expect(row.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(
      (await db.passwordReset.findUniqueOrThrow({ where: { id: row.id } }))
        .deliveryPayload,
    ).toBeNull();
  });
  it('restablece una vez, revoca access/refresh de todas las sesiones y no inicia otra', async () => {
    const first = await login().expect(200),
      second = await login().expect(200),
      token = await deliveredToken();
    const res = await reset(token).expect(204);
    expect(res.headers['set-cookie']?.[0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    for (const session of [first, second]) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${session.body.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', origin)
        .set('Cookie', session.headers['set-cookie'])
        .send({})
        .expect(401);
    }
    await login().expect(401);
    await login(nextPassword).expect(200);
    await reset(token, 'otra-frase-diferente').expect(400);
    expect(
      await db.authSession.count({ where: { userId: id, revokedAt: null } }),
    ).toBe(1);
  });
  it('cambio exige clave actual, rechaza reutilización y revoca sesiones y enlaces pendientes', async () => {
    const session = await login().expect(200),
      token = await deliveredToken();
    const change = (currentPassword: string, newPassword = nextPassword) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/password/change')
        .set('Origin', origin)
        .set('Authorization', `Bearer ${session.body.accessToken}`)
        .send({ currentPassword, newPassword });
    await change('incorrecta').expect(400);
    await change(oldPassword, oldPassword).expect(400);
    expect(
      await db.authSession.count({ where: { userId: id, revokedAt: null } }),
    ).toBe(1);
    await change(oldPassword).expect(204);
    await change(oldPassword).expect(401);
    await reset(token).expect(400);
    await login(nextPassword).expect(200);
  });
  it('expirados, usados o cuentas inactivas no cambian credenciales', async () => {
    const token = await deliveredToken(),
      hash = createHash('sha256').update(token).digest('hex');
    await db.passwordReset.update({
      where: { tokenHash: hash },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await reset(token).expect(400);
    await db.passwordReset.update({
      where: { tokenHash: hash },
      data: { expiresAt: new Date(Date.now() + 60000) },
    });
    await db.user.update({ where: { id }, data: { status: 'INACTIVE' } });
    await reset(token).expect(400);
    await db.user.update({ where: { id }, data: { status: 'ACTIVE' } });
    await login().expect(200);
    await reset(randomBytes(32).toString('base64url')).expect(400);
  });
  it('dos restablecimientos concurrentes consumen el enlace una sola vez', async () => {
    const token = await deliveredToken(),
      attempts = await Promise.all([
        reset(token),
        reset(token, 'otra-contraseña-ficticia'),
      ]);
    expect(attempts.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      204, 400,
    ]);
    expect(
      await db.passwordReset.count({
        where: { userId: id, usedAt: { not: null } },
      }),
    ).toBe(1);
  });
  it('limita solicitudes por cuenta sin invalidar enlaces y recupera entrega fallida sin filtrar tokens', async () => {
    await forgot().expect(200);
    await forgot().expect(200);
    expect(await db.passwordReset.count({ where: { userId: id } })).toBe(1);
    mail.send.mockRejectedValueOnce(new Error('SMTP falló'));
    await app.get(PasswordSecurityService).deliverPending();
    const row = await db.passwordReset.findFirstOrThrow({
      where: { userId: id },
    });
    expect(row.deliveryAttempts).toBe(1);
    expect(row.deliveredAt).toBeNull();
    expect(row.deliveryPayload).toBeTruthy();
    await db.passwordReset.update({
      where: { id: row.id },
      data: { lastDeliveryAttemptAt: new Date(Date.now() - 31000) },
    });
    await app.get(PasswordSecurityService).deliverPending();
    expect(
      (await db.passwordReset.findUniqueOrThrow({ where: { id: row.id } }))
        .deliveredAt,
    ).not.toBeNull();
  });
  it('un login verificado antes del reset no crea una sesión después del cambio', async () => {
    const token = await deliveredToken(),
      passwords = app.get(PasswordService),
      original = passwords.verify.bind(passwords);
    let verified!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        verified = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    const spy = vi
      .spyOn(passwords, 'verify')
      .mockImplementationOnce(async (password, stored) => {
        const result = await original(password, stored);
        verified();
        await gate;
        return result;
      });
    const attempt = login().then((result) => result.status);
    try {
      await reached;
      await app.get(PasswordSecurityService).reset(token, nextPassword);
      release();
      expect(await attempt).toBe(401);
      expect(
        await db.authSession.count({ where: { userId: id, revokedAt: null } }),
      ).toBe(0);
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('correo deshabilitado falla de forma explícita para cualquier dirección', async () => {
    app.get(ConfigService).set('MAIL_MODE', 'disabled');
    await forgot().expect(503);
    await forgot('absent@example.invalid').expect(503);
    expect(await db.passwordReset.count({ where: { userId: id } })).toBe(0);
  });
});
