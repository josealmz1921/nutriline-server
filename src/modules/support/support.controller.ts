import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { PublicUser } from '../auth/auth.types.js';
import { SupportService } from './support.service.js';
import {
  adminCreateTicketSchema,
  changeTicketSchema,
  closeTicketSchema,
  createTicketSchema,
  pageSchema,
  replySchema,
  ticketListSchema,
  ticketParams,
  type ChangeTicket,
  type CreateTicket,
  type Reply,
  type TicketList,
} from './support.schemas.js';

@ApiTags('support')
@ApiBearerAuth()
@Roles('ADMIN', 'NUTRITIONIST')
@Controller('support/tickets')
export class SupportController {
  constructor(
    @Inject(SupportService) private readonly support: SupportService,
  ) {}
  @Get() list(
    @CurrentUser() user: PublicUser,
    @Query(new ZodValidationPipe(ticketListSchema)) query: TicketList,
  ) {
    return this.support.list(user, query);
  }
  @Post() @Roles('NUTRITIONIST') create(
    @CurrentUser() user: PublicUser,
    @Body(new ZodValidationPipe(createTicketSchema)) body: CreateTicket,
  ) {
    return this.support.create(user, body);
  }
  @Get(':ticketId') detail(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(ticketParams)) params: { ticketId: string },
  ) {
    return this.support.detail(user, params.ticketId);
  }
  @Get(':ticketId/messages') messages(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(ticketParams)) params: { ticketId: string },
    @Query(new ZodValidationPipe(pageSchema.strict()))
    query: z.infer<typeof pageSchema>,
  ) {
    return this.support.conversation(user, params.ticketId, query);
  }
  @Get(':ticketId/events') events(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(ticketParams)) params: { ticketId: string },
    @Query(new ZodValidationPipe(pageSchema.strict()))
    query: z.infer<typeof pageSchema>,
  ) {
    return this.support.events(user, params.ticketId, query);
  }
  @Post(':ticketId/messages') reply(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(ticketParams)) params: { ticketId: string },
    @Body(new ZodValidationPipe(replySchema)) body: Reply,
  ) {
    return this.support.reply(user, params.ticketId, body);
  }
  @Post(':ticketId/close') @Roles('NUTRITIONIST') close(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(ticketParams)) params: { ticketId: string },
    @Body(new ZodValidationPipe(closeTicketSchema))
    body: z.infer<typeof closeTicketSchema>,
  ) {
    return this.support.change(user, params.ticketId, {
      ...body,
      status: 'CLOSED',
    });
  }
  @Patch(':ticketId') @Roles('ADMIN') change(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(ticketParams)) params: { ticketId: string },
    @Body(new ZodValidationPipe(changeTicketSchema)) body: ChangeTicket,
  ) {
    return this.support.change(user, params.ticketId, body);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(
    @Inject(SupportService) private readonly support: SupportService,
  ) {}
  @Post() create(
    @CurrentUser() user: PublicUser,
    @Body(new ZodValidationPipe(adminCreateTicketSchema))
    body: z.infer<typeof adminCreateTicketSchema>,
  ) {
    const { nutritionistId, ...input } = body;
    return this.support.create(user, input, nutritionistId);
  }
}
