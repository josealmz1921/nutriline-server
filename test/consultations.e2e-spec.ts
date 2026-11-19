import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { ConsultationsService } from '../src/modules/consultations/consultations.service.js';
import { setupApp } from '../src/setup-app.js';

const patientId = '30000000-0000-4000-8000-000000000001';
const consultationId = '40000000-0000-4000-8000-000000000001';
const input = {
  occurredAt: '2026-11-04T17:00:00Z',
  reason: ' Demo ',
  anthropometry: {
    measuredAt: '2026-11-04T17:00:00Z',
    weightKg: '70',
    heightCm: '175',
  },
};
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'demo@example.invalid',
  role: 'NUTRITIONIST' as const,
  status: 'ACTIVE' as const,
  nutritionistProfile: {
    id: '20000000-0000-4000-8000-000000000001',
    displayName: 'Demo',
    timezone: 'America/Mexico_City',
  },
};
describe('consultas HTTP, guards y validación reales', () => {
  let app: INestApplication;
  const service = {
    create: vi.fn(),
    list: vi.fn(),
    detail: vi.fn(),
    directory: vi.fn(),
  };
  const authenticate = vi.fn();
  const auth = { Authorization: 'Bearer synthetic-access-token' };
  beforeEach(async () => {
    vi.resetAllMocks();
    authenticate.mockResolvedValue({ user, sessionId: 'synthetic-session' });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({ authenticate })
      .overrideProvider(ConsultationsService)
      .useValue(service)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('propaga identidad, IDs y datos normalizados; pagina historial', async () => {
    service.create.mockResolvedValue({ id: consultationId });
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/consultations`)
      .set(auth)
      .send(input)
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(user, patientId, {
      ...input,
      reason: 'Demo',
    });
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientId}/consultations`)
      .set(auth)
      .expect(200);
    expect(service.list).toHaveBeenCalledWith(user, patientId, {
      page: 1,
      pageSize: 20,
    });
    await request(app.getHttpServer())
      .get(`/api/v1/consultations/${consultationId}`)
      .set(auth)
      .expect(200);
    expect(service.detail).toHaveBeenCalledWith(user, consultationId);
  });
  it('exige sesión y deniega ADMIN también en el directorio global', async () => {
    for (const token of [false, true]) {
      authenticate.mockResolvedValue({
        user: { ...user, role: 'ADMIN' },
        sessionId: 'demo',
      });
      const headers = token ? auth : {};
      const status = token ? 403 : 401;
      await request(app.getHttpServer())
        .get('/api/v1/consultations')
        .set(headers)
        .expect(status);
      await request(app.getHttpServer())
        .post(`/api/v1/patients/${patientId}/consultations`)
        .set(headers)
        .send(input)
        .expect(status);
      await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientId}/consultations`)
        .set(headers)
        .expect(status);
      await request(app.getHttpServer())
        .get(`/api/v1/consultations/${consultationId}`)
        .set(headers)
        .expect(status);
    }
    expect(service.create).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();
    expect(service.directory).not.toHaveBeenCalled();
  });
  it('rechaza campos calculados, UUID inválido y queries ambiguas', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/consultations`)
      .set(auth)
      .send({ ...input, bmi: '22' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/consultations/invalid')
      .set(auth)
      .expect(400);
    for (const query of ['page=1&page=2', 'pageSize=101', 'owner=x'])
      await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientId}/consultations?${query}`)
        .set(auth)
        .expect(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
  });
  it('valida y normaliza el directorio global sin aceptar propietario ni queries ambiguas', async () => {
    service.directory.mockResolvedValue({
      data: [],
      meta: { page: 2, pageSize: 5, total: 0 },
      summary: { patients: 0, archivedConsultations: 0 },
    });
    await request(app.getHttpServer())
      .get(
        '/api/v1/consultations?page=2&pageSize=5&search=%20Demo%20&status=archived&order=patient&fromDate=2026-01-01&toDate=2026-12-31',
      )
      .set(auth)
      .expect(200);
    expect(service.directory).toHaveBeenCalledWith(user, {
      page: 2,
      pageSize: 5,
      search: 'Demo',
      status: 'archived',
      order: 'patient',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
    service.directory.mockClear();
    for (const query of [
      'page=1&page=2',
      'search[]=x',
      'pageSize=101',
      'owner=x',
      'nutritionistId=x',
      'status=cancelled',
      'order=unknown',
      'fromDate=2026-02-30',
      'fromDate=2026-02-02&toDate=2026-02-01',
      'search=',
      `search=${'a'.repeat(151)}`,
    ])
      await request(app.getHttpServer())
        .get(`/api/v1/consultations?${query}`)
        .set(auth)
        .expect(400);
    expect(service.directory).not.toHaveBeenCalled();
  });
  it('documenta el directorio, medidas decimales y resultado BMI string', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(
      doc.paths['/api/v1/patients/{patientId}/consultations']?.post?.responses[
        '201'
      ],
    ).toBeDefined();
    expect(
      doc.paths['/api/v1/patients/{patientId}/consultations']?.get?.parameters,
    ).toHaveLength(3);
    expect(
      doc.paths['/api/v1/consultations/{consultationId}']?.get?.responses[
        '200'
      ],
    ).toBeDefined();
    expect(JSON.stringify(doc.paths)).toContain('22.86');
    expect(doc.paths['/api/v1/consultations']?.get?.parameters).toHaveLength(7);
  });
});
