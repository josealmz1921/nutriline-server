import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PatientsService } from '../src/modules/patients/patients.service.js';
import { setupApp } from '../src/setup-app.js';

const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'synthetic@example.invalid',
  role: 'NUTRITIONIST' as const,
  status: 'ACTIVE' as const,
  nutritionistProfile: {
    id: '20000000-0000-4000-8000-000000000001',
    displayName: 'Perfil Ficticio',
    timezone: 'America/Mexico_City',
  },
};
const patientId = '30000000-0000-4000-8000-000000000001';

describe('pacientes HTTP (servicio sustituido, validación y guards reales)', () => {
  let app: INestApplication;
  const patients = {
    create: vi.fn(),
    list: vi.fn(),
    detail: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    reactivate: vi.fn(),
  };
  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({
        authenticate: vi
          .fn()
          .mockResolvedValue({ user, sessionId: 'synthetic-session' }),
      })
      .overrideProvider(PatientsService)
      .useValue(patients)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  const auth = { Authorization: 'Bearer synthetic-access-token' };

  it('propaga identidad de sesión y DTO validado en creación', async () => {
    patients.create.mockResolvedValue({ id: patientId });
    await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set(auth)
      .send({ fullName: ' Paciente Demo ', birthDate: '1992-05-15' })
      .expect(201);
    expect(patients.create).toHaveBeenCalledWith(user, {
      fullName: 'Paciente Demo',
      birthDate: '1992-05-15',
    });
  });
  it('aplica defaults de paginación y transforma archived=false sin hacerlo truthy', async () => {
    patients.list.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set(auth)
      .query({ archived: 'false' })
      .expect(200);
    expect(patients.list).toHaveBeenCalledWith(user, {
      page: 1,
      pageSize: 20,
      archived: false,
    });
  });
  it('rechaza filtros repetidos, arrays, campos extra y UUIDs inválidos antes del servicio', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/patients?page=1&page=2')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/patients?search[]=name')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set(auth)
      .send({
        fullName: 'Demo',
        birthDate: '1992-05-15',
        nutritionistId: user.nutritionistProfile.id,
      })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/patients/not-a-uuid')
      .set(auth)
      .expect(400);
    expect(patients.list).not.toHaveBeenCalled();
    expect(patients.create).not.toHaveBeenCalled();
    expect(patients.detail).not.toHaveBeenCalled();
  });
  it('exige sesión para cada ruta', async () => {
    await request(app.getHttpServer()).get('/api/v1/patients').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/patients')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientId}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/patients/${patientId}`)
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/archive`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/reactivate`)
      .send({ expectedUpdatedAt: '2026-11-19T13:00:00Z' })
      .expect(401);
  });
  it('valida reactivación con versión y transmite la identidad autenticada', async () => {
    const input = { expectedUpdatedAt: '2026-11-19T13:00:00.000Z' };
    patients.reactivate.mockResolvedValue({ id: patientId, archivedAt: null });
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/reactivate`)
      .set(auth)
      .send(input)
      .expect(200);
    expect(patients.reactivate).toHaveBeenCalledWith(user, patientId, input);
    patients.reactivate.mockClear();
    for (const body of [
      {},
      { ...input, nutritionistId: 'other' },
      { ...input, archivedAt: null },
      { expectedUpdatedAt: 'ayer' },
    ])
      await request(app.getHttpServer())
        .post(`/api/v1/patients/${patientId}/reactivate`)
        .set(auth)
        .send(body)
        .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/patients/not-a-uuid/reactivate')
      .set(auth)
      .send(input)
      .expect(400);
    expect(patients.reactivate).not.toHaveBeenCalled();
  });
  it('documenta las seis rutas, paginación y fecha de nacimiento date-only', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(
      doc.paths['/api/v1/patients']?.post?.responses?.['201'],
    ).toMatchObject({
      content: {
        'application/json': {
          schema: { properties: { birthDate: { format: 'date' } } },
        },
      },
    });
    expect(doc.paths['/api/v1/patients']?.get?.parameters).toHaveLength(4);
    expect(doc.paths['/api/v1/patients/{patientId}']?.get).toBeDefined();
    expect(doc.paths['/api/v1/patients/{patientId}']?.patch).toBeDefined();
    expect(
      doc.paths['/api/v1/patients/{patientId}/archive']?.post?.responses?.[
        '200'
      ],
    ).toBeDefined();
    expect(
      doc.paths['/api/v1/patients/{patientId}/reactivate']?.post?.responses?.[
        '200'
      ],
    ).toBeDefined();
  });
});
