import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const parserType =
      typeof exception === 'object' && exception !== null && 'type' in exception
        ? exception.type
        : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : parserType === 'entity.parse.failed'
          ? 400
          : parserType === 'entity.too.large'
            ? 413
            : 500;
    const requestId = randomUUID();
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const detail =
      typeof body === 'object' && body !== null
        ? (body as { message?: unknown; fields?: unknown })
        : null;
    const message =
      status >= 500
        ? 'Error interno del servidor'
        : typeof detail?.message === 'string'
          ? detail.message
          : typeof body === 'string'
            ? body
            : status === 400
              ? 'JSON inválido'
              : 'Solicitud rechazada';
    if (status >= 500)
      this.logger.error(`Error interno; requestId=${requestId}`);
    response.setHeader('X-Request-Id', requestId);
    response.status(status).json({
      error: {
        code: `HTTP_${status}`,
        message,
      ...(status === 400 && Array.isArray(detail?.fields)
          ? { details: { fields: detail.fields } }
          : {}),
        requestId,
      },
    });
  }
}
