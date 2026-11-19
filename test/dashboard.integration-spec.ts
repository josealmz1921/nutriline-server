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
const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
  profiles = [randomUUID(), randomUUID()];
describe('dashboard aislado por nutriólogo', () => {
  let app: INestApplication, tokens: string[];
  beforeAll(async () => {
    await db.$connect();
    const passwordHash = await new PasswordService().hash(
      'dashboard-synthetic-password',
    );
    for (const [i, id] of ids.entries())
      await db.user.create({
        data: {
          id,
          email: `${id}@example.invalid`,
          passwordHash,
          role: i === 2 ? 'ADMIN' : 'NUTRITIONIST',
          ...(i < 2
            ? {
                nutritionistProfile: {
                  create: { id: profiles[i], displayName: 'Resumen ficticio' },
                },
              }
            : {}),
        },
      });
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
        .send({
          email: `${id}@example.invalid`,
          password: 'dashboard-synthetic-password',
        })
        .expect(200);
      tokens.push(res.body.accessToken);
    }
  });
  afterAll(async () => {
    await app.close();
    await db.appointment.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.consultation.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.patient.deleteMany({
      where: { nutritionistId: { in: profiles } },
    });
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.nutritionistProfile.deleteMany({
      where: { id: { in: profiles } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  const get = (i: number) =>
    request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${tokens[i]}`);
  it('deniega anónimos, ADMIN y nutriólogos sin perfil', async () => {
    await request(app.getHttpServer()).get('/api/v1/dashboard').expect(401);
    await get(2).expect(403);
    await get(3).expect(403);
  });
  it('espacio vacío confirmado sin datos de otros profesionales', async () => {
    const res = await get(1).expect(200);
    expect(res.body.totals).toEqual({
      activePatients: 0,
      archivedPatients: 0,
      consultations: 0,
      withoutConsultations: 0,
      upcomingAppointments: 0,
    });
    expect(res.body.recentConsultations).toEqual([]);
  });
  it('totales históricos, listas limitadas y orden estable; citas no cuentan como consultas', async () => {
    const active = await db.patient.create({
      data: {
        nutritionistId: profiles[0],
        fullName: 'Activo ficticio',
        birthDate: new Date('1990-01-01Z'),
      },
    });
    const archived = await db.patient.create({
      data: {
        nutritionistId: profiles[0],
        fullName: 'Archivado ficticio',
        birthDate: new Date('1990-01-01Z'),
        archivedAt: new Date(),
      },
    });
    for (let i = 0; i < 7; i++)
      await db.consultation.create({
        data: {
          patientId: archived.id,
          nutritionistId: profiles[0],
          reason: `Consulta ${i}`,
          occurredAt: new Date('2020-01-01Z'),
          createdAt: new Date(Date.now() - (7 - i) * 60000),
        },
      });
    for (const [i, status] of [
      'scheduled',
      'confirmed',
      'cancelled',
      'attended',
      'noShow',
      'scheduled',
    ].entries()) {
      const startsAt = new Date(Date.now() + (i === 5 ? -1 : i + 1) * 86400000);
      await db.appointment.create({
        data: {
          patientId: active.id,
          nutritionistId: profiles[0],
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3600000),
          localStartsAt: startsAt.toISOString().slice(0, 16),
          timeZone: 'UTC',
          reason: 'Cita ficticia',
          notes: '',
          status,
        },
      });
    }
    const res = await get(0).expect(200);
    expect(res.body.totals).toEqual({
      activePatients: 1,
      archivedPatients: 1,
      consultations: 7,
      withoutConsultations: 1,
      upcomingAppointments: 2,
    });
    expect(res.body.recentConsultations).toHaveLength(5);
    expect(res.body.recentConsultations[0].reason).toBe('Consulta 6');
    expect(res.body.recentConsultations[0]).not.toHaveProperty('assessment');
    expect(
      res.body.upcomingAppointments.map(
        (row: { status: string }) => row.status,
      ),
    ).toEqual(['scheduled', 'confirmed']);
    const other = await get(1).expect(200);
    expect(other.body.totals.consultations).toBe(0);
    expect(other.body.upcomingAppointments).toEqual([]);
  });
});
