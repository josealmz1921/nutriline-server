import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client.js';
import type { AuthRequest } from './auth.types.js';

export const PUBLIC_ROUTE = 'auth:public';
export const ALLOWED_ROLES = 'auth:roles';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: UserRole[]) =>
  SetMetadata(ALLOWED_ROLES, roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const identity = context.switchToHttp().getRequest<AuthRequest>().auth;
    if (!identity) throw new UnauthorizedException('Sesión inválida');
    return identity.user;
  },
);
