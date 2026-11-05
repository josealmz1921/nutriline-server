import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
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
const ids = Array.from({ length: 4 }, () => randomUUID());
const profiles = [randomUUID(), randomUUID()];
const password = 'synthetic-patient-test-password';
const input = { fullName: 'Paciente Ficticio', birthDate: '1992-05-15' };

describe('pacientes HTTP con MySQL real y dos propietarios', () => {
  let app: INestApplication;
  let tokens: string[];
  let own: string;
  let foreign: string;
  beforeAll(async () => {
    await db.$connect();
    const passwordHash = await new PasswordService().hash(password);
    for (const [index, id] of ids.entries())
      await db.user.create({
        data: {
          id,
          email: `${id}@example.invalid`,
          passwordHash,
          role: index === 2 ? 'ADMIN' : 'NUTRITIONIST',
          ...(index < 2
            ? {
                nutritionistProfile: {
                  create: {
                    id: profiles[index],
                    displayName: 'Perfil de prueba ficticio',
                  },
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
    tokens = [];
    for (const id of ids) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: `${id}@example.invalid`, password })
        .expect(200);
      tokens.push(res.body.accessToken);
    }
    own = (
      await db.patient.create({
        data: {
          nutritionistId: profiles[0],
          fullName: 'Ana Ficticia',
          birthDate: new Date('1990-01-01Z'),
        },
      })
    ).id;
    foreign = (
      await db.patient.create({
        data: {
          nutritionistId: profiles[1],
          fullName: 'Secreto Ajeno',
          birthDate: new Date('1990-01-01Z'),
          email: 'private@example.invalid',
        },
      })
    ).id;
  });
  afterEach(async () => {
    await app.close();
    const scope = { nutritionistId: { in: profiles } };
    const consultations = await db.consultation.findMany({
      where: scope,
      select: { id: true },
    });
    const consultationScope = {
      consultationId: { in: consultations.map((row) => row.id) },
    };
    await db.calculationResult.deleteMany({ where: consultationScope });
    await db.anthropometricAssessment.deleteMany({ where: consultationScope });
    await db.consultation.deleteMany({ where: scope });
    await db.patient.deleteMany({ where: scope });
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
  });
  afterAll(async () => {
    await db.nutritionistProfile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  const api = (index = 0) => {
    const auth = { Authorization: `Bearer ${tokens[index]}` };
    return {
      list: () =>
        request(app.getHttpServer()).get('/api/v1/patients').set(auth),
      create: () =>
        request(app.getHttpServer()).post('/api/v1/patients').set(auth),
      detail: (id: string) =>
        request(app.getHttpServer()).get(`/api/v1/patients/${id}`).set(auth),
      update: (id: string) =>
        request(app.getHttpServer()).patch(`/api/v1/patients/${id}`).set(auth),
      archive: (id: string) =>
        request(app.getHttpServer())
          .post(`/api/v1/patients/${id}/archive`)
          .set(auth),
    };
  };

  it('crea contacto opcional, fecha sin zona y propietario desde sesión; actualiza y limpia contacto', async () => {
    const res = await api().create().send(input).expect(201);
    expect(res.body).toMatchObject({
      ...input,
      email: null,
      phone: null,
      occupation: null,
      archivedAt: null,
    });
    expect(res.body).not.toHaveProperty('nutritionistId');
    expect(res.body).not.toHaveProperty('consultations');
    const row = await db.patient.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row.nutritionistId).toBe(profiles[0]);
    const updated = await api()
      .update(res.body.id)
      .send({
        fullName: ' Nombre Editado ',
        email: ' DEMO@EXAMPLE.INVALID ',
        phone: '+52 555 0000',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      fullName: 'Nombre Editado',
      email: 'demo@example.invalid',
      birthDate: input.birthDate,
    });
    const cleared = await api()
      .update(res.body.id)
      .send({ email: null, phone: null })
      .expect(200);
    expect(cleared.body).toMatchObject({ email: null, phone: null });
    await api().detail(res.body.id).expect(200);
  });

  it('deniega todas las rutas sin sesión, a ADMIN y a nutriólogo sin perfil', async () => {
    await request(app.getHttpServer()).get('/api/v1/patients').expect(401);
    for (const index of [2, 3]) {
      await api(index).create().send(input).expect(403);
      await api(index).list().expect(403);
      await api(index).detail(own).expect(403);
      await api(index)
        .update(own)
        .send({ fullName: 'No permitido' })
        .expect(403);
      await api(index).archive(own).expect(403);
    }
  });

  it('cada acceso ajeno responde igual que inexistente y no modifica el registro', async () => {
    for (const id of [foreign, randomUUID()]) {
      const detail = await api().detail(id).expect(404);
      const update = await api()
        .update(id)
        .send({ fullName: 'Ataque' })
        .expect(404);
      const archive = await api().archive(id).expect(404);
      for (const response of [detail, update, archive]) {
        expect(response.body.error.message).toBe('Paciente no encontrado');
        expect(JSON.stringify(response.body)).not.toContain('Secreto');
      }
    }
    const row = await db.patient.findUniqueOrThrow({ where: { id: foreign } });
    expect(row.fullName).toBe('Secreto Ajeno');
    expect(row.archivedAt).toBeNull();
    await api(1).detail(foreign).expect(200);
    await api(1).detail(own).expect(404);
  });

  it('rechaza owner/role/IDs, fechas inválidas y PATCH vacío; no persiste entradas inválidas', async () => {
    for (const changes of [
      { nutritionistId: profiles[1] },
      { role: 'ADMIN' },
      { id: randomUUID() },
      { birthDate: '2023-02-29' },
      { birthDate: '2999-01-01' },
      { email: '' },
      { fullName: '' },
    ])
      await api()
        .create()
        .send({ ...input, ...changes })
        .expect(400);
    for (const body of [
      {},
      { nutritionistId: profiles[1] },
      { archivedAt: null },
      { birthDate: null },
    ]) {
      await api().update(own).send(body).expect(400);
    }
    await api().detail('not-a-uuid').expect(400);
    await api().archive(own).send({ fullName: 'No permitido' }).expect(400);
    expect(
      await db.patient.count({ where: { nutritionistId: profiles[0] } }),
    ).toBe(1);
  });

  it('pagina con orden estable y busca solo nombre/email/teléfono propios; total aislado', async () => {
    const sameName = await Promise.all(
      [1, 2].map(() =>
        db.patient.create({
          data: {
            nutritionistId: profiles[0],
            fullName: 'Beto Ficticio',
            birthDate: new Date('1992-01-01Z'),
            email: 'contacto@example.invalid',
            phone: '5551234567',
          },
        }),
      ),
    );
    const first = await api().list().query({ pageSize: '2' }).expect(200);
    const second = await api()
      .list()
      .query({ page: '2', pageSize: '2' })
      .expect(200);
    expect(first.body.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    const returned = [...first.body.data, ...second.body.data];
    expect(returned.map((row: { id: string }) => row.id)).toEqual([
      own,
      ...sameName.map((row) => row.id).sort(),
    ]);
    expect(JSON.stringify(returned)).not.toContain('Secreto');
    for (const search of ['Beto', 'contacto@', '1234567']) {
      const res = await api().list().query({ search }).expect(200);
      expect(res.body.meta.total).toBe(2);
    }
    for (const search of ['Secreto', 'private@', '%', '_', "' OR 1=1 --"]) {
      const res = await api().list().query({ search }).expect(200);
      expect(res.body.meta.total).toBe(0);
    }
    const beyond = await api().list().query({ page: '999' }).expect(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.total).toBe(3);
    const other = await api(1).list().expect(200);
    expect(other.body.data.map((row: { id: string }) => row.id)).toEqual([
      foreign,
    ]);
  });

  it('busca comodines como texto literal y rechaza queries ambiguas o desconocidas', async () => {
    await db.patient.update({
      where: { id: own },
      data: { fullName: 'Demo 100%_\\literal' },
    });
    for (const search of ['%', '_', '\\literal']) {
      const res = await api().list().query({ search }).expect(200);
      expect(res.body.data.map((row: { id: string }) => row.id)).toEqual([own]);
    }
    for (const query of [
      { page: '0' },
      { pageSize: '101' },
      { archived: 'yes' },
      { nutritionistId: profiles[1] },
      { page: ['1', '2'] },
    ]) {
      await api().list().query(query).expect(400);
    }
  });

  it('archivo idempotente y concurrente conserva detalle e historial; bloquea edición', async () => {
    const consultation = await db.consultation.create({
      data: {
        patientId: own,
        nutritionistId: profiles[0],
        occurredAt: new Date('2026-01-01Z'),
        reason: 'Consulta ficticia',
        anthropometry: {
          create: {
            measuredAt: new Date('2026-01-01Z'),
            weightKg: '70',
            heightCm: '175',
          },
        },
      },
    });
    const results = await Promise.all([api().archive(own), api().archive(own)]);
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    expect(results[0].body.archivedAt).toBeTruthy();
    expect(results[0].body).toEqual(results[1].body);
    const again = await api().archive(own).expect(200);
    expect(again.body).toEqual(results[0].body);
    await api().detail(own).expect(200);
    await api().update(own).send({ fullName: 'No editable' }).expect(409);
    const active = await api().list().expect(200);
    expect(active.body.meta.total).toBe(0);
    const archived = await api().list().query({ archived: 'true' }).expect(200);
    expect(archived.body.data.map((row: { id: string }) => row.id)).toEqual([
      own,
    ]);
    expect(
      await db.consultation.count({ where: { id: consultation.id } }),
    ).toBe(1);
    expect(
      await db.anthropometricAssessment.count({
        where: { consultationId: consultation.id },
      }),
    ).toBe(1);
  });

  it('serializa edición frente a archivo; el resultado final siempre queda archivado', async () => {
    const results = await Promise.all([
      api().update(own).send({ fullName: 'Editado en carrera' }),
      api().archive(own),
    ]);
    expect([200, 409]).toContain(results[0].status);
    expect(results[1].status).toBe(200);
    const row = await db.patient.findUniqueOrThrow({ where: { id: own } });
    expect(row.archivedAt).not.toBeNull();
    await api().update(own).send({ fullName: 'Posterior' }).expect(409);
  });
});
