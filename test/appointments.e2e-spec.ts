import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AppointmentsService } from '../src/modules/appointments/appointments.service.js';
import { setupApp } from '../src/setup-app.js';
import { appointmentFixture } from './appointment-fixture.js';
const id = '40000000-0000-4000-8000-000000000001',
  patientId = '30000000-0000-4000-8000-000000000001';
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'agenda@example.invalid',
  role: 'NUTRITIONIST',
  status: 'ACTIVE',
  nutritionistProfile: {
    id: '20000000-0000-4000-8000-000000000001',
    displayName: 'Ficticio',
    timezone: 'UTC',
  },
};
describe('agenda HTTP con guards y validación reales', () => {
  let app: INestApplication;
  const service = { write: vi.fn(), list: vi.fn(), detail: vi.fn() },
    authenticate = vi.fn(),
    auth = { Authorization: 'Bearer synthetic-token' };
  beforeEach(async () => {
    vi.resetAllMocks();
    authenticate.mockResolvedValue({ user, sessionId: 'synthetic' });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({ authenticate })
      .overrideProvider(AppointmentsService)
      .useValue(service)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('propaga operación y versión, no deriva consulta y documenta rutas', async () => {
    const body = appointmentFixture(patientId, '2026-11-19T10:00:00Z');
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(auth)
      .send(body)
      .expect(201);
    expect(service.write).toHaveBeenCalledWith(user, body);
    const status = {
      status: 'attended',
      expectedVersion: 1,
      clientRequestId: body.clientRequestId,
    };
    await request(app.getHttpServer())
      .post(`/api/v1/appointments/${id}/status`)
      .set(auth)
      .send(status)
      .expect(200);
    expect(service.write).toHaveBeenCalledWith(user, status, id);
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(
      doc.paths['/api/v1/appointments/{appointmentId}/status'].post,
    ).toBeDefined();
  });
  it('deniega sin sesión y a ADMIN y valida body/queries antes de llegar al servicio', async () => {
    const body = appointmentFixture(patientId, '2026-11-19T10:00:00Z');
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(auth)
      .send({ ...body, consultationId: id })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/appointments?from=bad&to=bad')
      .set(auth)
      .expect(400);
    authenticate.mockResolvedValue({
      user: { ...user, role: 'ADMIN' },
      sessionId: 'synthetic',
    });
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(auth)
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/appointments/${id}`)
      .set(auth)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/appointments/${id}`)
      .set(auth)
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/appointments/${id}/status`)
      .set(auth)
      .send({
        status: 'attended',
        expectedVersion: 1,
        clientRequestId: body.clientRequestId,
      })
      .expect(403);
    expect(service.write).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
  });
});
