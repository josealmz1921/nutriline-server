import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { PublicUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AdminService } from './admin.service.js';
import {
  adminListSchema,
  paymentListSchema,
  type AdminList,
  type PaymentList,
  userParamsSchema,
  accountStatusSchema,
  auditListSchema,
  type AccountStatus,
  type AuditList,
} from './admin.schemas.js';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}
  @Get('users') users(
    @Query(new ZodValidationPipe(adminListSchema)) query: AdminList,
  ) {
    return this.admin.users(query);
  }
  @Get('users/:userId') user(
    @Param(new ZodValidationPipe(userParamsSchema)) params: { userId: string },
  ) {
    return this.admin.user(params.userId);
  }
  @Patch('users/:userId/status') status(
    @CurrentUser() actor: PublicUser,
    @Param(new ZodValidationPipe(userParamsSchema)) params: { userId: string },
    @Body(new ZodValidationPipe(accountStatusSchema)) body: AccountStatus,
  ) {
    return this.admin.setStatus(actor, params.userId, body);
  }
  @Get('audit') audit(
    @Query(new ZodValidationPipe(auditListSchema)) query: AuditList,
  ) {
    return this.admin.audit(query);
  }
  @Get('summary') summary() {
    return this.admin.summary();
  }
  @Get('nutritionists') nutritionists(
    @Query(new ZodValidationPipe(adminListSchema)) query: AdminList,
  ) {
    return this.admin.nutritionists(query);
  }
  @Get('payments') payments(
    @Query(new ZodValidationPipe(paymentListSchema)) query: PaymentList,
  ) {
    return this.admin.payments(query);
  }
}
