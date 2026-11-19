import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import type { Environment } from '../../config/environment.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Public, Roles } from './auth.decorators.js';
import { OriginGuard } from './auth.guards.js';
import type { AuthRequest } from './auth.types.js';
import { PasswordSecurityService } from './password-security.service.js';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './password-security.schemas.js';
const schema = (
  v:
    | typeof forgotPasswordSchema
    | typeof resetPasswordSchema
    | typeof changePasswordSchema,
) => z.toJSONSchema(v, { target: 'openapi-3.0' }) as SchemaObject;
@ApiTags('auth')
@Controller('auth/password')
@UseGuards(OriginGuard)
@ApiHeader({ name: 'Origin', required: true })
export class PasswordSecurityController {
  constructor(
    @Inject(PasswordSecurityService)
    private readonly passwords: PasswordSecurityService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}
  @Public()
  @Post('forgot')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiBody({ schema: schema(forgotPasswordSchema) })
  @ApiOkResponse({
    description:
      'Respuesta genérica igual para cuentas existentes, inactivas o ausentes; sin enlace/token en JSON',
  })
  forgot(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    body: z.infer<typeof forgotPasswordSchema>,
  ) {
    return this.passwords.forgot(body.email);
  }
  @Public()
  @Post('reset')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBody({ schema: schema(resetPasswordSchema) })
  @ApiNoContentResponse({
    description:
      'Contraseña restablecida. Todas las sesiones revocadas. Sin inicio automático.',
  })
  async reset(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    body: z.infer<typeof resetPasswordSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.passwords.reset(body.token, body.newPassword);
    this.clearCookie(response);
  }
  @Roles('ADMIN', 'NUTRITIONIST')
  @ApiBearerAuth()
  @Post('change')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBody({ schema: schema(changePasswordSchema) })
  @ApiNoContentResponse({
    description: 'Contraseña cambiada y todas las sesiones revocadas',
  })
  async change(
    @Req() request: AuthRequest,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: z.infer<typeof changePasswordSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.passwords.change(
      request.auth!.user.id,
      request.auth!.sessionId,
      body.currentPassword,
      body.newPassword,
    );
    this.clearCookie(response);
  }
  private clearCookie(response: Response) {
    response.clearCookie('nutriline_refresh', {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  }
}
