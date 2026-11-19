import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { setupApp } from '../src/setup-app.js';
import { completeAssessmentFixture } from './assessment-fixture.js';

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
    await db.dailyMenuRevision.deleteMany({ where: scope });
    await db.dailyMenu.deleteMany({ where: scope });
    await db.appointmentMutation.deleteMany({ where: scope });
    await db.appointment.deleteMany({ where: scope });
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
      reactivate: (id: string) =>
        request(app.getHttpServer())
          .post(`/api/v1/patients/${id}/reactivate`)
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
      await api(index)
        .reactivate(own)
        .send({ expectedUpdatedAt: new Date().toISOString() })
        .expect(403);
    }
  });
  it('persiste identidad complementaria y limpia sus valores sin modificar la consulta', async () => {
    const created = await api()
      .create()
      .send({ ...input, gender: 'Mujer', nationality: 'UK' })
      .expect(201);
    const read = await api().detail(created.body.id).expect(200);
    expect(read.body).toMatchObject({ gender: 'Mujer', nationality: 'UK' });
    const cleared = await api()
      .update(created.body.id)
      .send({
        gender: null,
        nationality: null,
        expectedUpdatedAt: read.body.updatedAt,
      })
      .expect(200);
    expect(cleared.body).toMatchObject({ gender: null, nationality: null });
    expect(new Date(cleared.body.updatedAt).getTime()).toBeGreaterThan(
      new Date(read.body.updatedAt).getTime(),
    );
    await api(1).update(created.body.id).send({ gender: 'Hombre' }).expect(404);
    expect(
      await db.consultation.count({ where: { patientId: created.body.id } }),
    ).toBe(0);
  });
  it('una edición obsoleta devuelve 409 y no sobrescribe cambios', async () => {
    const current = await api().detail(own).expect(200);
    const changed = await api()
      .update(own)
      .send({
        fullName: 'Cambio de otra pestaña',
        expectedUpdatedAt: current.body.updatedAt,
      })
      .expect(200);
    await api()
      .update(own)
      .send({
        fullName: 'No debe reemplazar',
        expectedUpdatedAt: current.body.updatedAt,
      })
      .expect(409);
    expect((await api().detail(own).expect(200)).body.fullName).toBe(
      changed.body.fullName,
    );
  });

  it('cada acceso ajeno responde igual que inexistente y no modifica el registro', async () => {
    for (const id of [foreign, randomUUID()]) {
      const detail = await api().detail(id).expect(404);
      const update = await api()
        .update(id)
        .send({ fullName: 'Ataque' })
        .expect(404);
      const archive = await api().archive(id).expect(404);
      const reactivated = await api()
        .reactivate(id)
        .send({ expectedUpdatedAt: new Date().toISOString() })
        .expect(404);
      for (const response of [detail, update, archive, reactivated]) {
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

  it('reactiva concurrentemente una sola vez, conserva historia y habilita edición y nueva consulta', async () => {
    const saved = await visits().create().send(visit).expect(201);
    const before = await visits().detail(saved.body.id).expect(200);
    const archived = await api().archive(own).expect(200);
    const input = { expectedUpdatedAt: archived.body.updatedAt };
    const results = await Promise.all([
      api().reactivate(own).send(input),
      api().reactivate(own).send(input),
    ]);
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    expect(results[0].body.archivedAt).toBeNull();
    expect(Date.parse(results[0].body.updatedAt)).toBeGreaterThan(
      Date.parse(archived.body.updatedAt),
    );
    const repeated = await api().reactivate(own).send(input).expect(200);
    expect(repeated.body).toEqual(results[0].body);
    expect((await api().list().expect(200)).body.meta.total).toBe(1);
    expect(
      (await api().list().query({ archived: 'true' }).expect(200)).body.meta
        .total,
    ).toBe(0);
    expect((await visits().detail(saved.body.id).expect(200)).body).toEqual(
      before.body,
    );
    await api()
      .update(own)
      .send({
        occupation: 'Edición tras reactivar',
        expectedUpdatedAt: repeated.body.updatedAt,
      })
      .expect(200);
    await visits().create().send(visit).expect(201);
    expect(await db.consultation.count({ where: { patientId: own } })).toBe(2);
  });
  it('una reactivación antigua no deshace un archivo posterior; repetir activo no pisa identidad', async () => {
    const first = await api().archive(own).expect(200);
    const input = { expectedUpdatedAt: first.body.updatedAt };
    await api().reactivate(own).send(input).expect(200);
    const edited = await api()
      .update(own)
      .send({ fullName: 'Nombre conservado' })
      .expect(200);
    expect((await api().reactivate(own).send(input).expect(200)).body).toEqual(
      edited.body,
    );
    const second = await api().archive(own).expect(200);
    await api().reactivate(own).send(input).expect(409);
    expect((await api().detail(own).expect(200)).body).toEqual(second.body);
    await api()
      .reactivate(own)
      .send({ expectedUpdatedAt: second.body.updatedAt })
      .expect(200);
  });
  it('reactivar no escribe en menús, citas ni evaluaciones persistidas', async () => {
    const input = await fullInput();
    const consultation = await visits().create().send(input).expect(201);
    const before = await db.consultation.findUniqueOrThrow({
      where: { id: consultation.body.id },
    });
    const menu = await db.dailyMenu.create({
      data: {
        patientId: own,
        nutritionistId: profiles[0],
        date: new Date('2026-11-19Z'),
        revisions: {
          create: {
            revision: 1,
            capture: { synthetic: 'Menú conservado' },
            patientSnapshot: { id: own },
            professionalSnapshot: { id: profiles[0] },
            clientRequestId: randomUUID(),
            requestHash: 'a'.repeat(64),
          },
        },
      },
      include: { revisions: true },
    });
    const appointment = await db.appointment.create({
      data: {
        patientId: own,
        nutritionistId: profiles[0],
        startsAt: new Date('2026-12-01T12:00:00Z'),
        endsAt: new Date('2026-12-01T13:00:00Z'),
        timeZone: 'UTC',
        localStartsAt: '2026-12-01T12:00',
        reason: 'Cita ficticia conservada',
        notes: '',
        status: 'cancelled',
      },
    });
    const archived = await api().archive(own).expect(200);
    await api()
      .reactivate(own)
      .send({ expectedUpdatedAt: archived.body.updatedAt })
      .expect(200);
    expect(
      await db.consultation.findUniqueOrThrow({
        where: { id: consultation.body.id },
      }),
    ).toEqual(before);
    expect(
      await db.dailyMenu.findUniqueOrThrow({
        where: { id: menu.id },
        include: { revisions: true },
      }),
    ).toEqual(menu);
    expect(
      await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } }),
    ).toEqual(appointment);
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

  const visit = {
    occurredAt: '2026-01-01T12:00:00Z',
    reason: 'Evaluación ficticia',
    anthropometry: {
      measuredAt: '2026-01-01T11:00:00Z',
      weightKg: '70',
      heightCm: '175',
      waistCm: '80',
      hipCm: '95',
    },
  };
  const visits = (patientId = own, index = 0) => ({
    create: () =>
      request(app.getHttpServer())
        .post(`/api/v1/patients/${patientId}/consultations`)
        .set('Authorization', `Bearer ${tokens[index]}`),
    list: () =>
      request(app.getHttpServer())
        .get(`/api/v1/patients/${patientId}/consultations`)
        .set('Authorization', `Bearer ${tokens[index]}`),
    detail: (id: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/consultations/${id}`)
        .set('Authorization', `Bearer ${tokens[index]}`),
  });

  const fullInput = async () => {
    const patient = await api().detail(own).expect(200);
    return completeAssessmentFixture(patient.body.updatedAt);
  };
  it('guarda evaluación completa atómica, conserva exclusiones y omite la captura pesada del listado', async () => {
    const input = await fullInput();
    const saved = await visits().create().send(input).expect(201);
    expect(saved.body.assessmentVersion).toBe(1);
    expect(saved.body.assessment.captures).toEqual(input.assessment.captures);
    expect(saved.body.assessment.patientSnapshot).toMatchObject({
      id: own,
      fullName: 'Ana Ficticia',
      birthDate: '1990-01-01',
    });
    expect(saved.body.anthropometry).toBeNull();
    expect(saved.body.calculations).toEqual([]);
    expect(saved.body).not.toHaveProperty('requestHash');
    expect(saved.body).not.toHaveProperty('nutritionistId');
    const read = await visits().detail(saved.body.id).expect(200);
    expect(read.body.assessment).toEqual(saved.body.assessment);
    const history = await visits().list().expect(200);
    expect(history.body.data[0]).toMatchObject({
      assessmentVersion: 1,
      clientRequestId: input.clientRequestId,
    });
    expect(history.body.data[0]).not.toHaveProperty('assessment');
    await visits(own, 1).detail(saved.body.id).expect(404);
    await visits(foreign).create().send(input).expect(404);
  });
  it('calcula resultados en servidor, ignora valores manipulados y conserva la instantánea al releer/reintentar', async () => {
    const input = await fullInput();
    input.assessment.captures.anthropometry = {
      measurementAvailability: 'captured',
      weight: '70',
      height: '175',
      waist: '80',
      hip: '95',
    };
    input.assessment.captures.formulas = {
      availability: 'captured',
      referenceDate: '2026-11-05',
      population: 'generalAdult',
      sex: 'male',
      metabolicAuthor: 'mifflin',
      exercise: '1.55',
      stress: 'none',
    };
    const clientBmr = input.assessment.results.find(
      (row) => row.group === 'formulas' && row.id === 'bmr',
    )!;
    clientBmr.value = 999999;
    clientBmr.label = 'Valor manipulado';
    const first = await visits().create().send(input).expect(201);
    const computed = first.body.assessment.serverCalculations;
    expect(computed.resultsOrigin).toBe('server');
    expect(computed.clinicalApproval).toBe(false);
    expect(computed.results).toHaveLength(47);
    expect(
      computed.results.find(
        (row: { group: string; id: string }) =>
          row.group === 'formulas' && row.id === 'bmr',
      ).value,
    ).toBeCloseTo(1618.75);
    expect(first.body.assessment.results).toEqual(input.assessment.results);
    const read = await visits().detail(first.body.id).expect(200);
    expect(read.body.assessment.serverCalculations).toEqual(computed);
    const retry = await visits().create().send(input).expect(201);
    expect(retry.body.assessment.serverCalculations).toEqual(computed);
    expect(retry.body.id).toBe(first.body.id);
    // El cambio posterior de nacimiento no reinterpreta un resultado histórico.
    await api().update(own).send({ birthDate: '1991-01-01' }).expect(200);
    const historical = await visits().detail(first.body.id).expect(200);
    expect(historical.body.assessment.serverCalculations).toEqual(computed);
    expect(historical.body.assessment.patientSnapshot.birthDate).toBe(
      '1990-01-01',
    );
    await visits()
      .create()
      .send({
        ...input,
        clientRequestId: randomUUID(),
        assessment: { ...input.assessment, serverCalculations: computed },
      })
      .expect(400);
  });
  it('guarda sin fecha de medición si las medidas se declaran no realizadas', async () => {
    const input = await fullInput();
    input.assessment.measuredAt = null;
    input.assessment.localTimes.measuredAt = null;
    const saved = await visits().create().send(input).expect(201);
    expect(saved.body.assessment.measuredAt).toBeNull();
    expect(saved.body.anthropometry).toBeNull();
    expect(saved.body.calculations).toEqual([]);
  });
  it('reintentos concurrentes del mismo contenido crean una sola consulta, incluso tras archivo', async () => {
    const input = await fullInput();
    const responses = await Promise.all([
      visits().create().send(input),
      visits().create().send(input),
    ]);
    expect(responses.map((row) => row.status)).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(await db.consultation.count({ where: { patientId: own } })).toBe(1);
    await visits()
      .create()
      .send({ ...input, reason: 'Otro contenido' })
      .expect(409);
    await api().archive(own).expect(200);
    const retry = await visits().create().send(input).expect(201);
    expect(retry.body.id).toBe(responses[0].body.id);
    await visits()
      .create()
      .send({ ...input, clientRequestId: randomUUID() })
      .expect(409);
  });
  it('calcula solo IMC en servidor y preserva precisión y resultados del cliente por separado', async () => {
    const input = await fullInput();
    input.assessment.captures.anthropometry = {
      measurementAvailability: 'captured',
      weight: '70,1234',
      height: '175.0001',
      supraspinale: '12.3456',
    };
    const saved = await visits().create().send(input).expect(201);
    expect(saved.body.calculations).toHaveLength(1);
    expect(saved.body.calculations[0].methodCode).toBe('BMI');
    expect(saved.body.assessment.resultsOrigin).toBe('client-snapshot');
    expect(saved.body.assessment.captures.anthropometry.weight).toBe('70,1234');
    const calculation = await db.calculationResult.findFirstOrThrow({
      where: { consultationId: saved.body.id },
    });
    expect(calculation.inputs).toEqual({
      weightKg: '70.1234',
      heightCm: '175.0001',
    });
    expect(saved.body.assessment.clinicalApproval).toBe(false);
  });
  it('no guarda con ficha obsoleta, cronología imposible ni zona incoherente', async () => {
    const input = await fullInput();
    await visits()
      .create()
      .send({ ...input, patientUpdatedAt: '2000-01-01T00:00:00.000Z' })
      .expect(409);
    await visits()
      .create()
      .send({ ...input, occurredAt: '2999-01-01T00:00:00.000Z' })
      .expect(400);
    await visits()
      .create()
      .send({
        ...input,
        assessment: {
          ...input.assessment,
          measuredAt: '2026-11-06T00:00:00.000Z',
        },
      })
      .expect(400);
    await visits()
      .create()
      .send({
        ...input,
        assessment: { ...input.assessment, timeZone: 'America/Mexico_City' },
      })
      .expect(400);
    expect(await db.consultation.count({ where: { patientId: own } })).toBe(0);
  });
  it('un fallo de transacción revierte captura, referencia idempotente y cálculos juntos', async () => {
    const input = await fullInput();
    const prisma = app.get(PrismaService);
    const transaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      transaction(async (tx) => {
        await callback(tx);
        throw new Error('synthetic rollback');
      })) as unknown as typeof prisma.$transaction);
    try {
      await visits().create().send(input).expect(500);
      expect(await db.consultation.count({ where: { patientId: own } })).toBe(
        0,
      );
    } finally {
      spy.mockRestore();
    }
    await visits().create().send(input).expect(201);
    expect(await db.consultation.count({ where: { patientId: own } })).toBe(1);
  });

  it('crea agregado atómico con IMC; separa consultas del mismo día e historial paginado', async () => {
    const first = await visits().create().send(visit).expect(201);
    const second = await visits().create().send(visit).expect(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body.anthropometry).toMatchObject({
      weightKg: '70.000',
      heightCm: '175.000',
      waistCm: '80.000',
      hipCm: '95.000',
    });
    expect(first.body.calculations[0]).toMatchObject({
      methodCode: 'BMI',
      methodVersion: '1',
      value: '22.86',
      unit: 'kg/m2',
    });
    expect(first.body).not.toHaveProperty('nutritionistId');
    const calculation = await db.calculationResult.findFirstOrThrow({
      where: { consultationId: first.body.id },
    });
    expect(calculation.value.toFixed(6)).toBe('22.857143');
    expect(calculation.inputs).toEqual({
      weightKg: '70.000',
      heightCm: '175.000',
    });
    const ids = [first.body.id, second.body.id]
      .sort((left: string, right: string) => left.localeCompare(right))
      .reverse();
    const page = await visits().list().query({ pageSize: '1' }).expect(200);
    expect(page.body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(page.body.data[0].id).toBe(ids[0]);
    const next = await visits()
      .list()
      .query({ page: '2', pageSize: '1' })
      .expect(200);
    expect(next.body.data[0].id).toBe(ids[1]);
    await visits().detail(first.body.id).expect(200);
    await api().archive(own).expect(200);
    await visits().list().expect(200);
    await visits().detail(first.body.id).expect(200);
    await visits().create().send(visit).expect(409);
  });

  it('aísla creación, historial y detalle; ADMIN y perfiles ausentes no acceden', async () => {
    const created = await visits().create().send(visit).expect(201);
    for (const id of [foreign, randomUUID()]) {
      await visits(id).create().send(visit).expect(404);
      await visits(id).list().expect(404);
    }
    await visits(own, 1).detail(created.body.id).expect(404);
    await visits().detail(randomUUID()).expect(404);
    for (const index of [2, 3]) {
      await visits(own, index).create().send(visit).expect(403);
      await visits(own, index).list().expect(403);
      await visits(own, index).detail(created.body.id).expect(403);
    }
  });

  it('rechaza fechas incoherentes y medidas inválidas sin escrituras', async () => {
    for (const changed of [
      { occurredAt: '1989-01-01T12:00:00Z' },
      { occurredAt: '2999-01-01T12:00:00Z' },
      {
        anthropometry: {
          ...visit.anthropometry,
          measuredAt: '2026-01-02T12:00:00Z',
        },
      },
      {
        anthropometry: {
          ...visit.anthropometry,
          measuredAt: '1989-01-01T12:00:00Z',
        },
      },
      { anthropometry: { ...visit.anthropometry, heightCm: '0' } },
      { anthropometry: { ...visit.anthropometry, heightCm: '0.001' } },
    ])
      await visits()
        .create()
        .send({ ...visit, ...changed })
        .expect(400);
    expect(await db.consultation.count({ where: { patientId: own } })).toBe(0);
  });

  it('serializa creación/archivo y bloquea toda creación posterior al archivo', async () => {
    const [created, archived] = await Promise.all([
      visits().create().send(visit),
      api().archive(own),
    ]);
    expect([201, 409]).toContain(created.status);
    expect(archived.status).toBe(200);
    await visits().create().send(visit).expect(409);
    const history = await visits().list().expect(200);
    expect(history.body.meta.total).toBe(created.status === 201 ? 1 : 0);
  });

  it('revierte todas las escrituras reales ante un fallo antes del commit', async () => {
    const prisma = app.get(PrismaService);
    const originalTransaction = prisma.$transaction.bind(prisma);
    // Run the real service writes, then fail inside the real MySQL transaction.
    // No SQL triggers or elevated DB privileges are required.
    const failingTransaction = (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      originalTransaction(async (tx) => {
        await callback(tx);
        throw new Error('synthetic transaction failure');
      });
    const spy = vi
      .spyOn(prisma, '$transaction')
      .mockImplementationOnce(
        failingTransaction as unknown as typeof prisma.$transaction,
      );
    try {
      const response = await visits().create().send(visit).expect(500);
      expect(JSON.stringify(response.body)).not.toContain(
        'synthetic transaction failure',
      );
      expect(await db.consultation.count({ where: { patientId: own } })).toBe(
        0,
      );
      expect(
        await db.anthropometricAssessment.count({
          where: { consultation: { patientId: own } },
        }),
      ).toBe(0);
      expect(
        await db.calculationResult.count({
          where: { consultation: { patientId: own } },
        }),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});
