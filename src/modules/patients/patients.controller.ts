import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
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
import { PatientsService } from './patients.service.js';
import {
  createPatientSchema,
  updatePatientSchema,
  listPatientsSchema,
  patientParamsSchema,
  emptyBodySchema,
  reactivatePatientSchema,
  type ReactivatePatient,
  type CreatePatient,
  type UpdatePatient,
  type ListPatients,
} from './patients.schemas.js';
import {
  createPatientBody,
  updatePatientBody,
  patientResponse,
  patientsPageResponse,
} from './patients.openapi.js';

@ApiTags('patients')
@ApiBearerAuth()
@Roles('NUTRITIONIST')
@Controller('patients')
export class PatientsController {
  constructor(
    @Inject(PatientsService) private readonly patients: PatientsService,
  ) {}

  @Post()
  @ApiBody({ schema: createPatientBody })
  @ApiCreatedResponse({ schema: patientResponse })
  create(
    @CurrentUser() user: PublicUser,
    @Body(new ZodValidationPipe(createPatientSchema)) body: CreatePatient,
  ) {
    return this.patients.create(user, body);
  }

  @Get()
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
  @ApiQuery({
    name: 'search',
    required: false,
    schema: { type: 'string', minLength: 1, maxLength: 150 },
    description: 'Texto literal en nombre, email o teléfono',
  })
  @ApiQuery({
    name: 'archived',
    required: false,
    schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
  })
  @ApiOkResponse({ schema: patientsPageResponse })
  list(
    @CurrentUser() user: PublicUser,
    @Query(new ZodValidationPipe(listPatientsSchema)) query: ListPatients,
  ) {
    return this.patients.list(user, query);
  }

  @Get(':patientId')
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiOkResponse({ schema: patientResponse })
  detail(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(patientParamsSchema))
    params: { patientId: string },
  ) {
    return this.patients.detail(user, params.patientId);
  }

  @Patch(':patientId')
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiBody({ schema: updatePatientBody })
  @ApiOkResponse({ schema: patientResponse })
  update(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(patientParamsSchema))
    params: { patientId: string },
    @Body(new ZodValidationPipe(updatePatientSchema)) body: UpdatePatient,
  ) {
    return this.patients.update(user, params.patientId, body);
  }

  @Post(':patientId/reactivate')
  @HttpCode(200)
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['expectedUpdatedAt'],
      properties: {
        expectedUpdatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOkResponse({
    schema: patientResponse,
    description:
      'Reactivación idempotente; conserva historial y citas. Versión obsoleta de un paciente archivado: 409.',
  })
  reactivate(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(patientParamsSchema))
    params: { patientId: string },
    @Body(new ZodValidationPipe(reactivatePatientSchema))
    body: ReactivatePatient,
  ) {
    return this.patients.reactivate(user, params.patientId, body);
  }

  @Post(':patientId/archive')
  @HttpCode(200)
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false },
  })
  @ApiOkResponse({
    schema: patientResponse,
    description: 'Archivo idempotente; no borra historial',
  })
  archive(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(patientParamsSchema))
    params: { patientId: string },
    @Body(new ZodValidationPipe(emptyBodySchema)) _body: unknown,
  ) {
    return this.patients.archive(user, params.patientId);
  }
}
