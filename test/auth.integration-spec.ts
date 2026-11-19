import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
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
) {
  throw new Error(
    'Integración requiere NODE_ENV=test y base exclusiva nutriline_test',
  );
}
const db = new PrismaClient({
  adapter: new PrismaMariaDb(connection),
  log: [],
});
const password = 'synthetic-password-for-auth-tests';
const origin = 'http://localhost:3000';
const users = [
  { id: randomUUID(), role: 'ADMIN' as const, status: 'ACTIVE' as const },
  {
    id: randomUUID(),
    role: 'NUTRITIONIST' as const,
    status: 'ACTIVE' as const,
  },
  {
    id: randomUUID(),
    role: 'NUTRITIONIST' as const,
    status: 'INACTIVE' as const,
  },
].map((user) => ({ ...user, email: `${user.id}@example.invalid` }));

function cookie(response: { headers: Record<string, any> }): string {
  return (response.headers['set-cookie'] as string[])[0].split(';')[0];
}

describe('auth con MySQL real', () => {
  let app: INestApplication;
  beforeAll(async () => {
    await db.$connect();
    const hash = await new PasswordService().hash(password);
    for (const user of users)
      await db.user.create({
        data: {
          ...user,
          passwordHash: hash,
          ...(user.role === 'NUTRITIONIST'
            ? {
                nutritionistProfile: {
                  create: { displayName: 'Perfil Sintético' },
                },
              }
            : {}),
        },
      });
  });
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    await db.authSession.deleteMany({
      where: { userId: { in: users.map((user) => user.id) } },
    });
    for (const user of users)
      await db.user.update({
        where: { id: user.id },
        data: { status: user.status, role: user.role },
      });
  });
  afterAll(async () => {
    const ids = users.map((user) => user.id);
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.nutritionistProfile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  const login = (email = users[0].email, pass = password) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: pass });
  const me = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
  const refresh = (value: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', value);

  it('login fija 24 horas y renovar conserva el mismo vencimiento absoluto', async () => {
    const start = Date.now();
    const first = await login().expect(200);
    const end = Date.parse(first.body.sessionExpiresAt);
    expect(end).toBeGreaterThanOrEqual(start + 86400000);
    expect(end).toBeLessThanOrEqual(Date.now() + 86400000);
    const rotated = await refresh(cookie(first)).expect(200);
    expect(rotated.body.sessionExpiresAt).toBe(first.body.sessionExpiresAt);
  });

  it('sesiones antiguas de siete días vencen a las 24 h del inicio de su familia, incluso rotadas', async () => {
    const first = await login().expect(200);
    const raw = cookie(first).split('=')[1];
    const root = await db.authSession.findUniqueOrThrow({
      where: {
        refreshTokenHash: createHash('sha256').update(raw).digest('hex'),
      },
    });
    await db.authSession.update({
      where: { id: root.id },
      data: {
        expiresAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(Date.now() - 23 * 3600000),
      },
    });
    const rotated = await refresh(cookie(first)).expect(200);
    expect(Date.parse(rotated.body.sessionExpiresAt)).toBeLessThan(
      Date.now() + 2 * 3600000,
    );
    // Simula una familia anterior al despliegue: token reciente y expiración antigua de siete días.
    await db.authSession.updateMany({
      where: { familyId: root.familyId },
      data: { expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
    await db.authSession.update({
      where: { id: root.id },
      data: { createdAt: new Date(Date.now() - 86400001) },
    });
    await me(rotated.body.accessToken).expect(401);
    await refresh(cookie(rotated)).expect(401);
    expect(
      await db.authSession.count({
        where: { familyId: root.familyId, revokedAt: null },
      }),
    ).toBe(0);
  });

  it('impide emails duplicados incluso con distinta capitalización', async () => {
    await expect(
      db.user.create({
        data: {
          email: users[0].email.toUpperCase(),
          role: 'ADMIN',
          passwordHash: 'synthetic-not-a-real-hash',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('inicia sesión con ambos roles y nunca devuelve hashes ni refresh en JSON', async () => {
    for (const user of users.slice(0, 2)) {
      const res = await login(user.email.toUpperCase()).expect(200);
      expect(res.body.user.role).toBe(user.role);
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('$argon2');
      const identity = await me(res.body.accessToken).expect(200);
      expect(identity.body.id).toBe(user.id);
      const raw = cookie(res).split('=')[1];
      const session = await db.authSession.findUnique({
        where: {
          refreshTokenHash: createHash('sha256').update(raw).digest('hex'),
        },
      });
      expect(session?.userId).toBe(user.id);
      expect(session?.refreshTokenHash).not.toBe(raw);
    }
  });
  it('responde igual a contraseña incorrecta, usuario desconocido y cuenta inactiva', async () => {
    for (const [email, pass] of [
      [users[0].email, 'wrong-password'],
      ['unknown@example.invalid', password],
      [users[2].email, password],
    ]) {
      const res = await login(email, pass).expect(401);
      expect(res.body.error.message).toBe('Credenciales inválidas');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });
  it('rota refresh, invalida access previo y revoca toda la familia ante reutilización', async () => {
    const initial = await login().expect(200);
    const rotated = await refresh(cookie(initial)).expect(200);
    expect(cookie(rotated)).not.toBe(cookie(initial));
    await me(initial.body.accessToken).expect(401);
    await me(rotated.body.accessToken).expect(200);
    await refresh(cookie(initial)).expect(401);
    await refresh(cookie(rotated)).expect(401);
    await me(rotated.body.accessToken).expect(401);
  });
  it('serializa rotaciones simultáneas e invalida su familia por replay', async () => {
    const initial = await login().expect(200);
    const responses = await Promise.all([
      refresh(cookie(initial)),
      refresh(cookie(initial)),
    ]);
    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 401,
    ]);
    const winner = responses.find((res) => res.status === 200)!;
    await me(winner.body.accessToken).expect(401);
    expect(
      await db.authSession.count({
        where: { userId: users[0].id, revokedAt: null },
      }),
    ).toBe(0);
  });
  it('logout es idempotente y revoca inmediatamente solo la familia correspondiente', async () => {
    const first = await login().expect(200);
    const second = await login().expect(200);
    for (let count = 0; count < 2; count++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', origin)
        .set('Cookie', cookie(first))
        .expect(204);
    await me(first.body.accessToken).expect(401);
    await refresh(cookie(first)).expect(401);
    await me(second.body.accessToken).expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .expect(204);
  });
  it('rechaza access expirado, mal firmado y con audiencia incorrecta', async () => {
    const initial = await login().expect(200);
    const jwt = app.get(JwtService);
    const decoded = jwt.decode<{ sub: string; sid: string }>(
      initial.body.accessToken,
    );
    const options = {
      secret: process.env.AUTH_ACCESS_SECRET!,
      subject: decoded.sub,
      issuer: 'nutriline-api',
      audience: 'nutriline-web',
    };
    const expired = await jwt.signAsync(
      { sid: decoded.sid },
      { ...options, expiresIn: -1 },
    );
    const wrongSecret = await jwt.signAsync(
      { sid: decoded.sid },
      { ...options, secret: 'different-secret', expiresIn: 300 },
    );
    const wrongAudience = await jwt.signAsync(
      { sid: decoded.sid },
      { ...options, audience: 'another-app', expiresIn: 300 },
    );
    const missingExpiration = await jwt.signAsync(
      { sid: decoded.sid },
      options,
    );
    const wrongAlgorithm = await jwt.signAsync(
      { sid: decoded.sid },
      { ...options, algorithm: 'HS512', expiresIn: 300 },
    );
    for (const token of [
      expired,
      wrongSecret,
      wrongAudience,
      missingExpiration,
      wrongAlgorithm,
    ])
      await me(token).expect(401);
  });
  it('rechaza refresh expirado y no prolonga el límite absoluto al rotar', async () => {
    const initial = await login().expect(200);
    const rawHash = createHash('sha256')
      .update(cookie(initial).split('=')[1])
      .digest('hex');
    const original = await db.authSession.findUniqueOrThrow({
      where: { refreshTokenHash: rawHash },
    });
    const rotated = await refresh(cookie(initial)).expect(200);
    const nextHash = createHash('sha256')
      .update(cookie(rotated).split('=')[1])
      .digest('hex');
    const next = await db.authSession.findUniqueOrThrow({
      where: { refreshTokenHash: nextHash },
    });
    expect(next.expiresAt).toEqual(original.expiresAt);
    await db.authSession.update({
      where: { id: next.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await refresh(cookie(rotated)).expect(401);
  });
  it('aplica estado y rol actuales de la base en cada petición', async () => {
    const initial = await login(users[1].email).expect(200);
    await db.user.update({
      where: { id: users[1].id },
      data: { role: 'ADMIN' },
    });
    const changed = await me(initial.body.accessToken).expect(200);
    expect(changed.body.role).toBe('ADMIN');
    await db.user.update({
      where: { id: users[1].id },
      data: { status: 'INACTIVE' },
    });
    await me(initial.body.accessToken).expect(401);
    await refresh(cookie(initial)).expect(401);
  });
});
