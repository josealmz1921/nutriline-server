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
import {
  ApiBearerAuth,
  ApiBody,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { PublicUser } from '../auth/auth.types.js';
import { patientParamsSchema } from '../patients/patients.schemas.js';
import {
  createMenuSchema,
  editMenuSchema,
  menuParamsSchema,
  revisionParamsSchema,
  menuListSchema,
  type CreateMenu,
  type EditMenu,
} from './menus.schemas.js';
import { MenusService } from './menus.service.js';
import {
  createMenuBody,
  editMenuBody,
  menuResponse,
  menusPageResponse,
} from './menus.openapi.js';
@ApiTags('menus')
@ApiBearerAuth()
@Roles('NUTRITIONIST')
@Controller()
export class MenusController {
  constructor(@Inject(MenusService) private readonly menus: MenusService) {}
  @Post('patients/:patientId/menus')
  @ApiParam({ name: 'patientId', type: String, format: 'uuid' })
  @ApiBody({
    schema: createMenuBody,
    description:
      '80 KB de captura como máximo. Al menos un tiempo incluido. Cantidades decimales positivas sin notación exponencial; campos y filas excluidos se preservan. clientRequestId es idempotente por propietario. El guardado no aprueba clínicamente.',
  })
  @ApiCreatedResponse({
    description:
      'Menú guardado, revisión 1. No crea consulta, consumo R24 ni cita.',
    schema: menuResponse,
  })
  create(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(patientParamsSchema)) p: { patientId: string },
    @Body(new ZodValidationPipe(createMenuSchema)) body: CreateMenu,
  ) {
    return this.menus.save(user, p.patientId, body);
  }
  @Get('patients/:patientId/menus')
  @ApiParam({ name: 'patientId', type: String, format: 'uuid' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Entero positivo, por defecto 1',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: '1–100; por defecto 20',
  })
  @ApiOkResponse({
    description: 'Listado paginado, sin capturas pesadas',
    schema: menusPageResponse,
  })
  list(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(patientParamsSchema)) p: { patientId: string },
    @Query(new ZodValidationPipe(menuListSchema))
    q: { page: number; pageSize: number },
  ) {
    return this.menus.list(user, p.patientId, q);
  }
  @Get('menus/:menuId')
  @ApiParam({ name: 'menuId', type: String, format: 'uuid' })
  @ApiOkResponse({
    description:
      'Última revisión persistida, con identidad histórica y captura completa',
    schema: menuResponse,
  })
  detail(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(menuParamsSchema)) p: { menuId: string },
  ) {
    return this.menus.detail(user, p.menuId);
  }
  @Get('menus/:menuId/revisions/:revision')
  @ApiParam({ name: 'menuId', type: String, format: 'uuid' })
  @ApiParam({
    name: 'revision',
    type: Number,
    description: 'Revisión positiva existente',
  })
  @ApiOkResponse({
    description: 'Revisión histórica inmutable',
    schema: menuResponse,
  })
  revision(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(revisionParamsSchema))
    p: { menuId: string; revision: number },
  ) {
    return this.menus.detail(user, p.menuId, p.revision);
  }
  @Patch('menus/:menuId')
  @ApiParam({ name: 'menuId', type: String, format: 'uuid' })
  @ApiBody({ schema: editMenuBody })
  @ApiOkResponse({
    description: 'Nueva revisión; expectedRevision evita sobrescrituras',
    schema: menuResponse,
  })
  edit(
    @CurrentUser() user: PublicUser,
    @Param(new ZodValidationPipe(menuParamsSchema)) p: { menuId: string },
    @Body(new ZodValidationPipe(editMenuSchema)) body: EditMenu,
  ) {
    return this.menus.edit(user, p.menuId, body);
  }
}
