import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Environment } from './config/environment.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  // Observe no se inicializa hasta completar la revisión de privacidad.
  // test
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  await app.listen(
    config.get('PORT', { infer: true }),
    config.get('HOST', { infer: true }),
  );
}
await bootstrap();
