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
)
  throw new Error('Solo base aislada nutriline_test');
const db = new PrismaClient({
  adapter: new PrismaMariaDb(connection),
  log: [],
});
const users = Array.from({ length: 4 }, () => randomUUID());
const profiles = [randomUUID(), randomUUID()];
const patientIds = [randomUUID(), randomUUID(), randomUUID()];
const consultationIds = Array.from({ length: 6 }, () => randomUUID());
const dates = [
  '2026-11-19T05:59:59.999Z',
  '2026-11-19T06:00:00.000Z',
  '2026-11-20T05:59:59.999Z',
  '2026-11-20T06:00:00.000Z',
  '2026-11-19T06:00:00.000Z',
];

describe('directorio general HTTP y MySQL aislado', () => {
  let app: INestApplication;
  const tokens: string[] = [];
  beforeAll(async () => {
    await db.$connect();
    const passwordHash = await new PasswordService().hash(
      'directory-synthetic-password',
    );
    for (const [i, id] of users.entries())
      await db.user.create({
        data: {
          id,
          email: `${id}@example.invalid`,
          passwordHash,
          role: i === 2 ? 'ADMIN' : 'NUTRITIONIST',
          ...(i < 2
            ? {
                nutritionistProfile: {
                  create: {
                    id: profiles[i],
                    displayName: 'Directorio ficticio',
                  },
                },
              }
            : {}),
        },
      });
    for (let i = 0; i < 3; i++)
      await db.patient.create({
        data: {
          id: patientIds[i],
          nutritionistId: profiles[i === 2 ? 1 : 0],
          fullName: i === 1 ? 'Beatriz archivada' : 'Álvaro ficticio',
          birthDate: new Date('1990-01-01Z'),
          archivedAt: i === 1 ? new Date() : null,
        },
      });
    for (let i = 0; i < 6; i++)
      await db.consultation.create({
        data: {
          id: consultationIds[i],
          nutritionistId: profiles[i === 5 ? 1 : 0],
          patientId: patientIds[i === 5 ? 2 : i === 2 || i === 3 ? 1 : 0],
          occurredAt: new Date(dates[i % 5]),
          reason: i === 1 ? 'Literal 100%_\\' : `Consulta ${i}`,
          notes: 'Nota privada que no debe incluir el listado',
          ...(i === 1
            ? { assessmentVersion: 1, assessment: { synthetic: true } }
            : {}),
        },
      });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    for (const id of users) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({
          email: `${id}@example.invalid`,
          password: 'directory-synthetic-password',
        })
        .expect(200);
      tokens.push(res.body.accessToken);
    }
  });
  afterAll(async () => {
    if (app) await app.close();
    await db.consultation.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.patient.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.nutritionistProfile.deleteMany({
      where: { id: { in: profiles } },
    });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  const get = (query: Record<string, string | number> = {}, owner = 0) =>
    request(app.getHttpServer())
      .get('/api/v1/consultations')
      .query(query)
      .set('Authorization', `Bearer ${tokens[owner]}`);
  it('deniega anónimos, ADMIN y cuentas sin perfil', async () => {
    await request(app.getHttpServer()).get('/api/v1/consultations').expect(401);
    await get({}, 2).expect(403);
    await get({}, 3).expect(403);
  });
  it('aísla registros y conteos por propietario y omite notas, cálculos y capturas', async () => {
    const { body } = await get().expect(200);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 5 });
    expect(body.summary).toEqual({ patients: 2, archivedConsultations: 2 });
    for (const row of body.data)
      expect(Object.keys(row).sort()).toEqual(
        ['id', 'patientId', 'occurredAt', 'reason', 'patient'].sort(),
      );
    const other = await get({}, 1).expect(200);
    expect(other.body.meta.total).toBe(1);
    expect(other.body.data.map((row: { id: string }) => row.id)).toEqual([
      consultationIds[5],
    ]);
    expect(other.body.summary).toEqual({
      patients: 1,
      archivedConsultations: 0,
    });
    const hidden = await get({ search: consultationIds[5] }).expect(200);
    expect(hidden.body.meta.total).toBe(0);
  });
  it('filtra activos/archivados y cuenta pacientes distintos en todo el conjunto filtrado', async () => {
    const active = await get({ status: 'active' }).expect(200);
    expect(active.body.meta.total).toBe(3);
    expect(active.body.summary).toEqual({
      patients: 1,
      archivedConsultations: 0,
    });
    const archived = await get({ status: 'archived', pageSize: 1 }).expect(200);
    expect(archived.body.data).toHaveLength(1);
    expect(archived.body.meta.total).toBe(2);
    expect(archived.body.summary).toEqual({
      patients: 1,
      archivedConsultations: 2,
    });
    expect(archived.body.data[0].patient.archivedAt).not.toBeNull();
  });
  it('busca sin acentos por nombre, motivo, IDs y comodines literales', async () => {
    const name = await get({ search: 'alvaro' }).expect(200);
    expect(name.body.meta.total).toBe(3);
    for (const search of ['100%_\\', '%', '_', '\\', consultationIds[1]]) {
      const res = await get({ search }).expect(200);
      expect(res.body.data.map((row: { id: string }) => row.id)).toEqual([
        consultationIds[1],
      ]);
    }
    const patient = await get({ search: patientIds[1] }).expect(200);
    expect(patient.body.meta.total).toBe(2);
  });
  it('incluye ambos extremos del día de México sin incluir días adyacentes', async () => {
    const res = await get({
      fromDate: '2026-11-19',
      toDate: '2026-11-19',
    }).expect(200);
    expect(new Set(res.body.data.map((row: { id: string }) => row.id))).toEqual(
      new Set([consultationIds[1], consultationIds[2], consultationIds[4]]),
    );
    expect(res.body.summary).toEqual({ patients: 2, archivedConsultations: 1 });
    const combined = await get({
      fromDate: '2026-11-19',
      toDate: '2026-11-19',
      status: 'archived',
    }).expect(200);
    expect(combined.body.data.map((row: { id: string }) => row.id)).toEqual([
      consultationIds[2],
    ]);
  });
  it('ordena estable y pagina sin duplicar ni perder consultas con el mismo instante', async () => {
    const ties = [consultationIds[1], consultationIds[4]].sort();
    const recent = [
      consultationIds[3],
      consultationIds[2],
      ...ties,
      consultationIds[0],
    ];
    const ids: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await get({ page, pageSize: 2 }).expect(200);
      expect(res.body.meta.total).toBe(5);
      ids.push(...res.body.data.map((row: { id: string }) => row.id));
    }
    expect(ids).toEqual(recent);
    const oldest = await get({ order: 'oldest' }).expect(200);
    expect(oldest.body.data.map((row: { id: string }) => row.id)).toEqual([
      consultationIds[0],
      ...ties,
      consultationIds[2],
      consultationIds[3],
    ]);
    const byName = await get({ order: 'patient' }).expect(200);
    expect(
      byName.body.data.map((row: { patientId: string }) => row.patientId),
    ).toEqual([
      patientIds[0],
      patientIds[0],
      patientIds[0],
      patientIds[1],
      patientIds[1],
    ]);
    const beyond = await get({ page: 10 }).expect(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.total).toBe(5);
  });
  it('acepta los extremos técnicos de fechas sin enviar año 10000 a MySQL', async () => {
    const all = await get({
      fromDate: '1000-01-01',
      toDate: '9999-12-31',
    }).expect(200);
    expect(all.body.meta.total).toBe(5);
    const future = await get({
      fromDate: '9999-12-31',
      toDate: '9999-12-31',
    }).expect(200);
    expect(future.body.meta.total).toBe(0);
  });
  it('el nombre actual se actualiza sin reescribir consultas', async () => {
    await db.patient.update({
      where: { id: patientIds[0] },
      data: { fullName: 'Nombre actualizado' },
    });
    const res = await get({ search: 'Nombre actualizado' }).expect(200);
    expect(res.body.meta.total).toBe(3);
    expect(
      res.body.data.every(
        (row: { patient: { fullName: string } }) =>
          row.patient.fullName === 'Nombre actualizado',
      ),
    ).toBe(true);
    const saved = await db.consultation.findUniqueOrThrow({
      where: { id: consultationIds[1] },
    });
    expect(saved.assessment).toEqual({ synthetic: true });
  });
});
