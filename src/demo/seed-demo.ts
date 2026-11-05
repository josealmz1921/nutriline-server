import { PasswordService } from '../modules/auth/password.service.js';
import type { PrismaClient, UserRole } from '../generated/prisma/client.js';

export function validateDemoSeedEnvironment(
  env: Record<string, string | undefined>,
): string {
  const url = env.DATABASE_URL ? URL.parse(env.DATABASE_URL) : null;
  if (
    !['development', 'test'].includes(env.NODE_ENV ?? '') ||
    env.DEMO_MODE !== 'true' ||
    !url ||
    !['db', 'db-test', 'localhost', '127.0.0.1'].includes(url.hostname) ||
    !['/nutriline', '/nutriline_test'].includes(url.pathname)
  ) {
    throw new Error(
      'Seed permitido únicamente en la base local demo/test explícitamente habilitada',
    );
  }
  const password = env.DEMO_PASSWORD;
  if (
    !password ||
    password.length < 12 ||
    password.length > 128 ||
    password.startsWith('replace-')
  ) {
    throw new Error('Configurar DEMO_PASSWORD propio de 12 a 128 caracteres');
  }
  return password;
}

export async function seedDemo(
  db: PrismaClient,
  env: Record<string, string | undefined>,
): Promise<void> {
  const password = validateDemoSeedEnvironment(env);
  const passwords = new PasswordService();
  const accounts: {
    id: string;
    email: string;
    role: UserRole;
    name: string;
  }[] = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'admin@nutriline.example',
      role: 'ADMIN',
      name: 'Administrador Demo',
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      email: 'nutriologo1@nutriline.example',
      role: 'NUTRITIONIST',
      name: 'Nutriólogo Demo Uno',
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      email: 'nutriologo2@nutriline.example',
      role: 'NUTRITIONIST',
      name: 'Nutriólogo Demo Dos',
    },
  ];
  const hashes = await Promise.all(
    accounts.map(() => passwords.hash(password)),
  );
  await db.$transaction(async (tx) => {
    for (const [index, account] of accounts.entries()) {
      const existing = await tx.user.findUnique({
        where: { email: account.email },
      });
      if (
        existing &&
        (existing.id !== account.id || existing.role !== account.role)
      )
        throw new Error('Conflicto con cuenta existente; seed cancelado');
      await tx.user.upsert({
        where: { email: account.email },
        update: {},
        create: {
          id: account.id,
          email: account.email,
          role: account.role,
          passwordHash: hashes[index],
        },
      });
      if (account.role === 'NUTRITIONIST') {
        const profile = await tx.nutritionistProfile.upsert({
          where: { userId: account.id },
          update: {},
          create: {
            userId: account.id,
            displayName: account.name,
          },
        });
        const patientId = `20000000-0000-4000-8000-00000000000${index}`;
        const existingPatient = await tx.patient.findUnique({
          where: { id: patientId },
        });
        if (existingPatient && existingPatient.nutritionistId !== profile.id)
          throw new Error('Conflicto con paciente existente; seed cancelado');
        await tx.patient.upsert({
          where: { id: patientId },
          update: {},
          create: {
            id: patientId,
            nutritionistId: profile.id,
            fullName: `Paciente Ficticio ${index}`,
            birthDate: new Date('1992-05-15T00:00:00Z'),
            email: `paciente${index}@nutriline.example`,
            occupation: 'Datos sintéticos de demostración',
          },
        });
      }
    }
  });
}
