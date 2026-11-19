import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PasswordSecurityService } from '../src/modules/auth/password-security.service.js';
import { recoveryMessage } from '../src/modules/auth/password-security.schemas.js';
import { setupApp } from '../src/setup-app.js';
const user = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'synthetic@example.invalid',
    role: 'ADMIN',
    status: 'ACTIVE',
    nutritionistProfile: null,
  },
  origin = 'http://localhost:3000';
describe('contraseñas HTTP con validación, Origin y rate limiting', () => {
  let app: INestApplication;
  const service = { forgot: vi.fn(), reset: vi.fn(), change: vi.fn() },
    authenticate = vi.fn();
  beforeEach(async () => {
    vi.resetAllMocks();
    service.forgot.mockResolvedValue(recoveryMessage);
    authenticate.mockResolvedValue({ user, sessionId: 'synthetic-session' });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({ authenticate })
      .overrideProvider(PasswordSecurityService)
      .useValue(service)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('recuperación pública es genérica, normaliza correo y exige Origin', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/forgot')
      .send({ email: user.email })
      .expect(403);
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/password/forgot')
      .set('Origin', origin)
      .send({ email: ' SYNTHETIC@EXAMPLE.INVALID ' })
      .expect(200);
    expect(result.body).toEqual(recoveryMessage);
    expect(service.forgot).toHaveBeenCalledWith(user.email);
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('cambio requiere sesión incluso para ADMIN; reset público no autentica ni abre sesión', async () => {
    const body = {
      currentPassword: 'ficticia-anterior',
      newPassword: 'nueva-frase-segura',
    };
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/change')
      .set('Origin', origin)
      .send(body)
      .expect(401);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/password/change')
      .set('Origin', origin)
      .set('Authorization', 'Bearer synthetic-token')
      .send(body)
      .expect(204);
    expect(res.headers['set-cookie']?.[0]).toContain('nutriline_refresh=;');
    expect(service.change).toHaveBeenCalledWith(
      user.id,
      'synthetic-session',
      body.currentPassword,
      body.newPassword,
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .set('Origin', origin)
      .send({ token: 'A'.repeat(43), newPassword: body.newPassword })
      .expect(204);
    expect(service.reset).toHaveBeenCalledWith(
      'A'.repeat(43),
      body.newPassword,
    );
  });
  it('rechaza cuerpos extra/tokens inválidos y limita solicitudes sin revelar cuentas', async () => {
    for (let i = 0; i < 3; i++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/password/forgot')
        .set('Origin', origin)
        .send({ email: `${i}@example.invalid` })
        .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/forgot')
      .set('Origin', origin)
      .send({ email: user.email })
      .expect(429);
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .set('Origin', origin)
      .send({ token: 'bad', newPassword: 'short', userId: user.id })
      .expect(400);
    expect(service.reset).not.toHaveBeenCalled();
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(
      doc.paths['/api/v1/auth/password/change'].post?.requestBody,
    ).toBeDefined();
  });
});
