import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { setupApp } from '../src/setup-app.js';

describe('catálogo de actividades HTTP', () => {
  let app: INestApplication;
  const authenticate = vi.fn();
  const auth = { Authorization: 'Bearer synthetic-token' };
  const user = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'activity@example.invalid',
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
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('devuelve actividades y MET históricos autenticados y paginados', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/activities?q=yoga&pageSize=5')
      .set(auth)
      .expect(200);
    expect(result.body.data.length).toBeGreaterThan(0);
    expect(result.body.data.length).toBeLessThanOrEqual(5);
    expect(result.body.meta.catalogVersion).toBe('legacy-activities-822-v1');
    expect(
      result.body.data.find((r: { id: string }) => r.id === '2150'),
    ).toMatchObject({ met: '2.5', name: 'Yoga Hatha' });
  });
  it('requiere sesión y rol; valida parámetros y no admite escritura', async () => {
    await request(app.getHttpServer()).get('/api/v1/activities').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/activities?pageSize=51')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/activities')
      .set(auth)
      .send({})
      .expect(404);
    authenticate.mockResolvedValue({
      user: { ...user, role: 'ADMIN' },
      sessionId: 'synthetic-session',
    });
    await request(app.getHttpServer())
      .get('/api/v1/activities')
      .set(auth)
      .expect(403);
  });
});
