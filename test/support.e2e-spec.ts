import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { SupportService } from '../src/modules/support/support.service.js';
import { AdminService } from '../src/modules/admin/admin.service.js';
import { setupApp } from '../src/setup-app.js';

describe('soporte y administración HTTP', () => {
  let app: INestApplication;
  const authenticate = vi.fn();
  const list = vi
    .fn()
    .mockResolvedValue({ data: [], meta: { total: 0, activeCount: 0 } });
  const summary = vi.fn().mockResolvedValue({ nutritionists: 0 });
  const auth = { Authorization: 'Bearer synthetic-support-token' };
  const user = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'support@example.invalid',
    role: 'NUTRITIONIST',
    status: 'ACTIVE',
    nutritionistProfile: {
      id: '20000000-0000-4000-8000-000000000001',
      displayName: 'Ficticio',
      timezone: 'America/Mexico_City',
    },
  };
  beforeEach(async () => {
    authenticate.mockResolvedValue({ user, sessionId: 'synthetic-session' });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({ authenticate })
      .overrideProvider(SupportService)
      .useValue({ list })
      .overrideProvider(AdminService)
      .useValue({ summary })
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('requiere sesión y restringe administración por rol, sin heredar acceso clínico', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/support/tickets')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/support/tickets')
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/summary')
      .set(auth)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/admin/support/tickets')
      .set(auth)
      .send({})
      .expect(403);
    authenticate.mockResolvedValue({
      user: { ...user, role: 'ADMIN', nutritionistProfile: null },
      sessionId: 'synthetic-session',
    });
    await request(app.getHttpServer())
      .get('/api/v1/admin/summary')
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set(auth)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set(auth)
      .send({})
      .expect(403);
  });
  it('rechaza entradas inválidas y no expone escritura de pagos ni borrado de tickets', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/support/tickets?pageSize=51')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set(auth)
      .send({ subject: 'x', body: '' })
      .expect(400);
    await request(app.getHttpServer())
      .delete('/api/v1/support/tickets/10000000-0000-4000-8000-000000000001')
      .set(auth)
      .expect(404);
    authenticate.mockResolvedValue({
      user: { ...user, role: 'ADMIN' },
      sessionId: 'synthetic-session',
    });
    await request(app.getHttpServer())
      .post('/api/v1/admin/payments')
      .set(auth)
      .send({ status: 'SUCCEEDED' })
      .expect(404);
  });
});
