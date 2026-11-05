import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { PublicUser } from '../auth/auth.types.js';
import { patientParamsSchema } from '../patients/patients.schemas.js';
import { ConsultationsService } from './consultations.service.js';
import {
  consultationParamsSchema,
  createConsultationSchema,
  listConsultationsSchema,
  type CreateConsultation,
  type ListConsultations,
} from './consultations.schemas.js';
import {
  consultationBody,
  consultationResponse,
  consultationsPageResponse,
} from './consultations.openapi.js';

@ApiTags('consultations')
@ApiBearerAuth()
@Roles('NUTRITIONIST')
@Controller()
export class ConsultationsController {
  constructor(
    @Inject(ConsultationsService)
    private readonly consultations: ConsultationsService,
  ) {}

  @Post('patients/:patientId/consultations')
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiBody({ schema: consultationBody })
  @ApiCreatedResponse({ schema: consultationResponse })
  create(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(patientParamsSchema))
    params: { patientId: string },
    @Body(new ZodValidationPipe(createConsultationSchema))
    body: CreateConsultation,
  ) {
    return this.consultations.create(user, params.patientId, body);
  }

  @Get('patients/:patientId/consultations')
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiOkResponse({ schema: consultationsPageResponse })
  list(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(patientParamsSchema))
    params: { patientId: string },
    @Query(new ZodValidationPipe(listConsultationsSchema))
    query: ListConsultations,
  ) {
    return this.consultations.list(user, params.patientId, query);
  }

  @Get('consultations/:consultationId')
  @ApiParam({ name: 'consultationId', format: 'uuid' })
  @ApiOkResponse({ schema: consultationResponse })
  detail(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(consultationParamsSchema))
    params: { consultationId: string },
  ) {
    return this.consultations.detail(user, params.consultationId);
  }
}
