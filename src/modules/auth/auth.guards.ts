import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment.js';
import type { UserRole } from '../../generated/prisma/client.js';
import { AuthService } from './auth.service.js';
import { ALLOWED_ROLES, PUBLIC_ROUTE } from './auth.decorators.js';
import type { AuthRequest } from './auth.types.js';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException('Sesión inválida');
    request.auth = await this.auth.authenticate(match[1]);
    return true;
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ALLOWED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest<AuthRequest>().auth?.user;
    if (!user || !roles?.includes(user.role))
      throw new ForbiddenException('Acceso no permitido');
    return true;
  }
}
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<AuthRequest>()
      .headers.origin;
    if (
      !origin ||
      !this.config.get('CORS_ORIGINS', { infer: true }).includes(origin)
    )
      throw new ForbiddenException('Origen no permitido');
    return true;
  }
}
