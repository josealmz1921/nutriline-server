import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  seedDemo,
  validateDemoSeedEnvironment,
} from '../src/demo/seed-demo.js';

validateDemoSeedEnvironment(process.env);
const db = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
  log: [],
});
try {
  await seedDemo(db, process.env);
  console.log(
    'Seed sintético completado. Usuarios existentes conservan su contraseña y estado.',
  );
} catch {
  console.error(
    'Seed cancelado. Revisar conectividad, migraciones y conflictos con datos existentes; no se muestran datos sensibles.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
