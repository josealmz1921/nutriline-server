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
  ApiOkResponse,
  ApiCreatedResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { PublicUser } from '../auth/auth.types.js';
import { AppointmentsService } from './appointments.service.js';
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  statusAppointmentSchema,
  appointmentParamsSchema,
  listAppointmentsSchema,
  type CreateAppointment,
  type RescheduleAppointment,
  type StatusAppointment,
  type ListAppointments,
} from './appointments.schemas.js';
const schema = (
  v:
    | typeof createAppointmentSchema
    | typeof rescheduleAppointmentSchema
    | typeof statusAppointmentSchema,
) => z.toJSONSchema(v, { target: 'openapi-3.0' }) as SchemaObject;
@ApiTags('appointments')
@ApiBearerAuth()
@Roles('NUTRITIONIST')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    @Inject(AppointmentsService)
    private readonly appointments: AppointmentsService,
  ) {}
  @Get()
  @ApiQuery({
    name: 'from',
    type: String,
    description: 'Inicio inclusivo ISO de minuto; máximo 63 días',
  })
  @ApiQuery({
    name: 'to',
    type: String,
    description: 'Fin exclusivo ISO de minuto',
  })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'pageSize', type: Number, required: false })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({ name: 'status', type: String, required: false })
  @ApiOkResponse({
    description:
      'Citas que se cruzan con el intervalo. Paginación estable y total; nunca truncamiento silencioso.',
  })
  list(
    @CurrentUser() user: PublicUser,
    @Query(new ZodValidationPipe(listAppointmentsSchema)) q: ListAppointments,
  ) {
    return this.appointments.list(user, q);
  }
  @Post()
  @ApiBody({ schema: schema(createAppointmentSchema) })
  @ApiCreatedResponse({
    description: 'Cita programada. No crea consulta ni envía avisos.',
  })
  create(
    @CurrentUser() user: PublicUser,
    @Body(new ZodValidationPipe(createAppointmentSchema))
    body: CreateAppointment,
  ) {
    return this.appointments.write(user, body);
  }
  @Get(':appointmentId')
  @ApiParam({ name: 'appointmentId', type: String, format: 'uuid' })
  @ApiOkResponse({ description: 'Detalle persistido de cita propia' })
  detail(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(appointmentParamsSchema))
    p: { appointmentId: string },
  ) {
    return this.appointments.detail(user, p.appointmentId);
  }
  @Patch(':appointmentId')
  @ApiParam({ name: 'appointmentId', type: String, format: 'uuid' })
  @ApiBody({ schema: schema(rescheduleAppointmentSchema) })
  @ApiOkResponse({
    description:
      'Reprogramación con expectedVersion, misma identidad de paciente',
  })
  reschedule(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(appointmentParamsSchema))
    p: { appointmentId: string },
    @Body(new ZodValidationPipe(rescheduleAppointmentSchema))
    body: RescheduleAppointment,
  ) {
    return this.appointments.write(user, body, p.appointmentId);
  }
  @Post(':appointmentId/status')
  @HttpCode(200)
  @ApiParam({ name: 'appointmentId', type: String, format: 'uuid' })
  @ApiBody({ schema: schema(statusAppointmentSchema) })
  @ApiOkResponse({
    description: 'Estado explícito con versión; asistencia nunca crea consulta',
  })
  status(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(appointmentParamsSchema))
    p: { appointmentId: string },
    @Body(new ZodValidationPipe(statusAppointmentSchema))
    body: StatusAppointment,
  ) {
    return this.appointments.write(user, body, p.appointmentId);
  }
}
