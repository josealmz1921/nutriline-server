import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from './config/environment.js';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpErrorFilter } from './common/http-error.filter.js';

export function setupApp(app: INestApplication): void {
  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  app.enableShutdownHooks();
  if (config.get('NODE_ENV', { infer: true }) === 'development') {
    const options = new DocumentBuilder()
      .setTitle('Nutriline API')
      .setVersion('1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, () =>
      SwaggerModule.createDocument(app, options),
    );
  }
}
