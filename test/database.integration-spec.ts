import { randomUUID } from 'node:crypto';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connection = process.env.DATABASE_URL;
// Defensa adicional: estas pruebas no deben apuntar a la base de demo o al legado.
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

describe('esquema MySQL real', () => {
  beforeAll(async () => {
    await db.$connect();
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('conecta con MySQL', async () => {
    expect(await db.$queryRaw`SELECT 1 AS ok`).toEqual([{ ok: 1n }]);
  });

  it('revierte escrituras y restringe consultas a su propietario por FK compuesta', async () => {
    const patientId = randomUUID();
    const userId = randomUUID();
    await expect(
      db.$transaction(async (tx) => {
        const first = await tx.user.create({
          data: {
            id: userId,
            email: `${userId}@example.invalid`,
            passwordHash: 'synthetic-not-a-real-password',
            role: 'NUTRITIONIST',
            nutritionistProfile: { create: { displayName: 'Demo Uno' } },
          },
          include: { nutritionistProfile: true },
        });
        const second = await tx.user.create({
          data: {
            email: `${randomUUID()}@example.invalid`,
            passwordHash: 'synthetic-not-a-real-password',
            role: 'NUTRITIONIST',
            nutritionistProfile: { create: { displayName: 'Demo Dos' } },
          },
          include: { nutritionistProfile: true },
        });
        await tx.patient.create({
          data: {
            id: patientId,
            nutritionistId: first.nutritionistProfile!.id,
            fullName: 'Paciente Sintético',
            birthDate: new Date('1992-05-15'),
          },
        });
        // Existe el segundo nutriólogo, pero no es propietario de ese paciente.
        await tx.consultation.create({
          data: {
            patientId,
            nutritionistId: second.nutritionistProfile!.id,
            occurredAt: new Date(),
            reason: 'Debe fallar',
          },
        });
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await db.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(
      await db.patient.findUnique({ where: { id: patientId } }),
    ).toBeNull();
  });

  it('conserva decimales y consultas separadas el mismo día', async () => {
    const userId = randomUUID();
    const rollback = new Error('rollback intencional de fixtures');
    await expect(
      db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: userId,
            email: `${userId}@example.invalid`,
            passwordHash: 'synthetic-not-a-real-password',
            role: 'NUTRITIONIST',
            nutritionistProfile: { create: { displayName: 'Demo Mediciones' } },
          },
          include: { nutritionistProfile: true },
        });
        const nutritionistId = user.nutritionistProfile!.id;
        const patient = await tx.patient.create({
          data: {
            nutritionistId,
            fullName: 'Paciente Sintético',
            birthDate: new Date('1992-05-15'),
          },
        });
        const occurredAt = new Date('2026-11-04T17:00:00Z');
        const consultation = await tx.consultation.create({
          data: {
            patientId: patient.id,
            nutritionistId,
            occurredAt,
            reason: 'Fixture de precisión',
            anthropometry: {
              create: {
                measuredAt: occurredAt,
                weightKg: '70.125',
                heightCm: '175.000',
                waistCm: '80.000',
                hipCm: '95.000',
              },
            },
            calculations: {
              create: {
                methodCode: 'BMI',
                methodVersion: '1',
                inputs: { weightKg: '70.125', heightCm: '175.000' },
                value: '22.897959',
                unit: 'kg/m2',
              },
            },
          },
          include: { anthropometry: true, calculations: true },
        });
        expect(consultation.anthropometry!.weightKg.toFixed(3)).toBe('70.125');
        expect(consultation.anthropometry!.waistCm!.toFixed(3)).toBe('80.000');
        expect(consultation.anthropometry!.hipCm!.toFixed(3)).toBe('95.000');
        expect(consultation.calculations[0].value.toFixed(6)).toBe('22.897959');
        const second = await tx.consultation.create({
          data: {
            patientId: patient.id,
            nutritionistId,
            occurredAt,
            reason: 'Otra consulta el mismo día',
          },
        });
        expect(second.id).not.toBe(consultation.id);
        expect(
          await tx.consultation.count({ where: { patientId: patient.id } }),
        ).toBe(2);
        throw rollback;
      }),
    ).rejects.toThrow(rollback);
    expect(await db.user.findUnique({ where: { id: userId } })).toBeNull();
  });
});
