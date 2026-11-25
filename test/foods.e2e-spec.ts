import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { setupApp } from '../src/setup-app.js';

const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'food@example.invalid',
  role: 'NUTRITIONIST',
  status: 'ACTIVE',
  nutritionistProfile: {
    id: '20000000-0000-4000-8000-000000000001',
    displayName: 'Ficticio',
    timezone: 'America/Mexico_City',
  },
};
describe('catálogo de alimentos HTTP', () => {
  let app: INestApplication;
  const authenticate = vi.fn();
  const auth = { Authorization: 'Bearer synthetic-token' };
  beforeEach(async () => {
    authenticate.mockResolvedValue({ user, sessionId: 'synthetic-session' });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({ authenticate })
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('busca alimentos autenticados y devuelve referencias paginadas sin nutrientes calculados', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/foods?q=manzana&pageSize=5')
      .set(auth)
      .expect(200);
    expect(result.body.data.length).toBeLessThanOrEqual(5);
    expect(result.body.meta.total).toBeGreaterThan(0);
    expect(result.body.meta.catalogVersion).toBe('legacy-foods-2176-v1');
    expect(result.body.data[0]).not.toHaveProperty('energiaKcal');
  });
  it('requiere sesión y rol de nutriólogo; no permite parámetros fuera de contrato', async () => {
    await request(app.getHttpServer()).get('/api/v1/foods').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/foods?pageSize=1000')
      .set(auth)
      .expect(400);
    authenticate.mockResolvedValue({
      user: { ...user, role: 'ADMIN' },
      sessionId: 'synthetic-session',
    });
    await request(app.getHttpServer())
      .get('/api/v1/foods')
      .set(auth)
      .expect(403);
  });
});
