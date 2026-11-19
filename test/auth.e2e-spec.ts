import {
  Controller,
  Get,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { Roles } from '../src/modules/auth/auth.decorators.js';
import { setupApp } from '../src/setup-app.js';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

@Controller('test-only')
class RolesProbeController {
  @Roles('ADMIN') @Get('admin') admin() {
    return { ok: true };
  }
  @Roles('NUTRITIONIST') @Get('clinical') clinical() {
    return { ok: true };
  }
  @Get('default-deny') defaultDeny() {
    return { ok: true };
  }
}

const admin = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'admin@example.invalid',
  role: 'ADMIN',
  status: 'ACTIVE',
  nutritionistProfile: null,
};
const nutritionist = {
  ...admin,
  id: '10000000-0000-4000-8000-000000000002',
  email: 'nutri@example.invalid',
  role: 'NUTRITIONIST',
};
const grant = {
  refreshToken: 'a'.repeat(43),
  refreshExpiresAt: new Date(Date.now() + 86400000),
  body: {
    accessToken: 'example-access-token',
    tokenType: 'Bearer',
    expiresIn: 300,
    sessionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    user: admin,
  },
};

describe('auth HTTP (servicio sustituido, guards reales)', () => {
  let app: INestApplication;
  const service = {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    authenticate: vi.fn(),
  };
  beforeEach(async () => {
    vi.resetAllMocks();
    service.login.mockResolvedValue(grant);
    service.refresh.mockResolvedValue(grant);
    service.logout.mockResolvedValue(undefined);
    service.authenticate.mockImplementation((token: string) => {
      if (!['admin-token', 'nutri-token'].includes(token))
        throw new UnauthorizedException('Sesión inválida');
      return Promise.resolve({
        user: token === 'admin-token' ? admin : nutritionist,
        sessionId: 'synthetic-session',
      });
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RolesProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue(service)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  const credentials = {
    email: '  ADMIN@EXAMPLE.INVALID ',
    password: 'synthetic-password',
  };

  it('documenta el contrato de auth sin credenciales ni campos internos', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(
      doc.paths['/api/v1/auth/login']?.post?.responses?.['200'],
    ).toMatchObject({
      content: {
        'application/json': {
          schema: {
            required: [
              'accessToken',
              'tokenType',
              'expiresIn',
              'sessionExpiresAt',
              'user',
            ],
          },
        },
      },
    });
    expect(JSON.stringify(doc)).not.toContain('passwordHash');
    expect(JSON.stringify(doc)).not.toContain(grant.refreshToken);
  });

  it('normaliza email, devuelve solo access token y cookie HttpOnly', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send(credentials)
      .expect(200);
    expect(service.login).toHaveBeenCalledWith(
      'admin@example.invalid',
      credentials.password,
    );
    expect(res.body).not.toHaveProperty('refreshToken');
    expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(res.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(res.headers['set-cookie'][0]).toContain('Path=/api/v1/auth');
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('marca Secure en producción', async () => {
    app.get(ConfigService).set('NODE_ENV', 'production');
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send(credentials)
      .expect(200);
    expect(res.headers['set-cookie'][0]).toContain('Secure');
  });
  it.each([undefined, 'https://attacker.example.com', 'null'])(
    'rechaza Origin no autorizado %s',
    async (origin) => {
      const req = request(app.getHttpServer()).post('/api/v1/auth/login');
      if (origin) req.set('Origin', origin);
      await req.send(credentials).expect(403);
      expect(service.login).not.toHaveBeenCalled();
    },
  );
  it('rechaza campos desconocidos sin reflejar contraseña', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ ...credentials, role: 'ADMIN' })
      .expect(400);
    expect(service.login).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain(credentials.password);
    expect(res.body.error).toMatchObject({
      code: 'HTTP_400',
      message: 'Entrada inválida',
    });
  });

  it('rechaza JSON inválido sin reflejar su contenido', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send('{"password":"must-not-appear",')
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain('must-not-appear');
    expect(service.login).not.toHaveBeenCalled();
  });

  it('no expone SQL, contraseñas o stack en un error inesperado', async () => {
    service.login.mockRejectedValue(
      new Error('SELECT passwordHash secret-value FROM users'),
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send(credentials)
      .expect(500);
    expect(res.body.error).toMatchObject({
      code: 'HTTP_500',
      message: 'Error interno del servidor',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret-value');
    expect(JSON.stringify(res.body)).not.toContain('SELECT');
  });
  it('limita login a 5 solicitudes por minuto e IP', async () => {
    for (let index = 0; index < 5; index++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send(credentials)
        .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send(credentials)
      .expect(429);
    expect(service.login).toHaveBeenCalledTimes(5);
  });
  it('protege identidad y separa roles; administrador no hereda acceso clínico', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/test-only/admin')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/test-only/admin')
      .set('Authorization', 'Bearer nutri-token')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/test-only/clinical')
      .set('Authorization', 'Bearer admin-token')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/test-only/clinical')
      .set('Authorization', 'Bearer nutri-token')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/test-only/default-deny')
      .set('Authorization', 'Bearer admin-token')
      .expect(403);
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer nutri-token')
      .expect(200);
    expect(res.body.role).toBe('NUTRITIONIST');
  });
  it('refresh/logout requieren Origin y usan exclusivamente cookie', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(403);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `nutriline_refresh=${grant.refreshToken}`)
      .expect(200);
    expect(service.refresh).toHaveBeenCalledWith(grant.refreshToken);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .expect(204);
    expect(res.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
  });
});
