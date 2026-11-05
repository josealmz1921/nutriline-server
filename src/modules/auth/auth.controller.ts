import {
  Body,
  Controller,
  Get,
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
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiHeader,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response, CookieOptions } from 'express';
import { z } from 'zod';
import type { Environment } from '../../config/environment.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public, Roles } from './auth.decorators.js';
import { OriginGuard } from './auth.guards.js';
import type { PublicUser, SessionGrant } from './auth.types.js';
import { publicUserSchema, sessionSchema } from './auth.openapi.js';

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}
  @Public()
  @UseGuards(OriginGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión; requiere Origin autorizado' })
  @ApiHeader({
    name: 'Origin',
    required: true,
    description:
      'Origen autorizado en CORS_ORIGINS; el navegador lo envía automáticamente',
  })
  @ApiOkResponse({
    schema: sessionSchema,
    description: 'Access token en JSON; refresh solo en cookie HttpOnly',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', maxLength: 254 },
        password: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          format: 'password',
        },
      },
    },
  })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(
      await this.auth.login(body.email, body.password),
      response,
    );
  }
  @Public()
  @UseGuards(OriginGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rotar cookie de renovación; requiere Origin autorizado',
  })
  @ApiHeader({ name: 'Origin', required: true })
  @ApiOkResponse({ schema: sessionSchema })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(z.object({}).strict().optional()))
    _body: unknown,
  ) {
    return this.respond(
      await this.auth.refresh(this.readCookie(request)),
      response,
    );
  }
  @Public()
  @UseGuards(OriginGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Revocar la familia de sesión; idempotente, requiere Origin autorizado',
  })
  @ApiHeader({ name: 'Origin', required: true })
  @ApiNoContentResponse({ description: 'Sesión revocada y cookie eliminada' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(z.object({}).strict().optional()))
    _body: unknown,
  ): Promise<void> {
    await this.auth.logout(this.readCookie(request));
    response.clearCookie('nutriline_refresh', this.cookieOptions());
  }
  @Roles('ADMIN', 'NUTRITIONIST')
  @ApiBearerAuth()
  @ApiOkResponse({ schema: publicUserSchema })
  @Get('me')
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }
  private readCookie(request: Request): unknown {
    return (request.cookies as Record<string, unknown> | undefined)
      ?.nutriline_refresh;
  }
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
  }
  private respond(grant: SessionGrant, response: Response) {
    response.cookie('nutriline_refresh', grant.refreshToken, {
      ...this.cookieOptions(),
      expires: grant.refreshExpiresAt,
    });
    return grant.body;
  }
}
