import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { MenusService } from '../src/modules/menus/menus.service.js';
import { setupApp } from '../src/setup-app.js';
import { menuFixture } from './menu-fixture.js';
const patientId = '30000000-0000-4000-8000-000000000001',
  menuId = '40000000-0000-4000-8000-000000000001';
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'menu@example.invalid',
  role: 'NUTRITIONIST',
  status: 'ACTIVE',
  nutritionistProfile: {
    id: '20000000-0000-4000-8000-000000000001',
    displayName: 'Ficticio',
    timezone: 'America/Mexico_City',
  },
};
describe('menús HTTP, guards, contrato y documentación', () => {
  let app: INestApplication;
  const service = {
      save: vi.fn(),
      edit: vi.fn(),
      list: vi.fn(),
      detail: vi.fn(),
    },
    authenticate = vi.fn(),
    auth = { Authorization: 'Bearer synthetic-token' };
  beforeEach(async () => {
    vi.resetAllMocks();
    authenticate.mockResolvedValue({ user, sessionId: 'synthetic-session' });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({ authenticate })
      .overrideProvider(MenusService)
      .useValue(service)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('acepta ingredientes v3 sin modificar sus referencias ni cantidades', async () => {
    const legacy = menuFixture();
    const input = {
      ...legacy,
      schemaVersion: 3,
      menu: {
        ...legacy.menu,
        meals: {
          custom: {
            ...legacy.menu.meals.breakfast,
            label: 'Mi tiempo',
            preparations: [
              {
                ...legacy.menu.meals.breakfast.preparations[0],
                ingredients: [
                  {
                    catalogId: '1231',
                    catalogVersion: 'legacy-foods-2176-v1',
                    name: 'Manzana',
                    quantity: '0,5',
                    unit: 'pieza',
                  },
                ],
              },
            ],
          },
        },
      },
    };
    service.save.mockResolvedValue({ id: menuId, schemaVersion: 3 });
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/menus`)
      .set(auth)
      .send(input)
      .expect(201);
    expect(service.save).toHaveBeenCalledWith(user, patientId, input);
  });
  it('propaga tiempos de nombres libres en versión 2 sin adaptarlos a horarios fijos', async () => {
    const legacy = menuFixture();
    const input = {
      ...legacy,
      schemaVersion: 2,
      menu: {
        ...legacy.menu,
        meals: {
          training: {
            ...legacy.menu.meals.breakfast,
            label: 'Después de entrenar',
          },
        },
      },
    };
    service.save.mockResolvedValue({ id: menuId, schemaVersion: 2 });
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/menus`)
      .set(auth)
      .send(input)
      .expect(201);
    expect(service.save).toHaveBeenCalledWith(user, patientId, input);
    const edit = { ...input, expectedRevision: 1 };
    await request(app.getHttpServer())
      .patch(`/api/v1/menus/${menuId}`)
      .set(auth)
      .send(edit)
      .expect(200);
    expect(service.edit).toHaveBeenCalledWith(user, menuId, edit);
  });
  it('propaga captura sin normalizar ni eliminar borradores y controla revisión', async () => {
    const input = menuFixture();
    service.save.mockResolvedValue({ id: menuId });
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/menus`)
      .set(auth)
      .send(input)
      .expect(201);
    expect(service.save).toHaveBeenCalledWith(user, patientId, input);
    const edit = { ...input, expectedRevision: 1 };
    await request(app.getHttpServer())
      .patch(`/api/v1/menus/${menuId}`)
      .set(auth)
      .send(edit)
      .expect(200);
    expect(service.edit).toHaveBeenCalledWith(user, menuId, edit);
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientId}/menus?page=2&pageSize=5`)
      .set(auth)
      .expect(200);
    expect(service.list).toHaveBeenCalledWith(user, patientId, {
      page: 2,
      pageSize: 5,
    });
    await request(app.getHttpServer())
      .get(`/api/v1/menus/${menuId}/revisions/1`)
      .set(auth)
      .expect(200);
    expect(service.detail).toHaveBeenCalledWith(user, menuId, 1);
  });
  it('exige sesión y deniega ADMIN en todas las rutas', async () => {
    for (const token of [false, true]) {
      authenticate.mockResolvedValue({
        user: { ...user, role: 'ADMIN' },
        sessionId: 'synthetic',
      });
      const h = token ? auth : {},
        status = token ? 403 : 401;
      await request(app.getHttpServer())
        .post(`/api/v1/patients/${patientId}/menus`)
        .set(h)
        .send(menuFixture())
        .expect(status);
      await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientId}/menus`)
        .set(h)
        .expect(status);
      await request(app.getHttpServer())
        .get(`/api/v1/menus/${menuId}`)
        .set(h)
        .expect(status);
      await request(app.getHttpServer())
        .get(`/api/v1/menus/${menuId}/revisions/1`)
        .set(h)
        .expect(status);
      await request(app.getHttpServer())
        .patch(`/api/v1/menus/${menuId}`)
        .set(h)
        .send({ ...menuFixture(), expectedRevision: 1 })
        .expect(status);
    }
    expect(service.save).not.toHaveBeenCalled();
    expect(service.edit).not.toHaveBeenCalled();
  });
  it('rechaza campos ajenos, edición sin revisión, cantidades inválidas y UUID/query ambiguos', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/menus`)
      .set(auth)
      .send({ ...menuFixture(), consultationId: menuId })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/menus/${menuId}`)
      .set(auth)
      .send(menuFixture())
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/menus/no-uuid`)
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/menus/${menuId}/revisions/0`)
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientId}/menus?page=1&page=2`)
      .set(auth)
      .expect(400);
    expect(service.save).not.toHaveBeenCalled();
    expect(service.edit).not.toHaveBeenCalled();
  });
  it('documenta captura, edición y revisiones sin errores de generación', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(
      doc.paths[`/api/v1/menus/{menuId}`].patch?.requestBody,
    ).toBeDefined();
    expect(
      doc.paths[`/api/v1/menus/{menuId}/revisions/{revision}`].get,
    ).toBeDefined();
  });
});
