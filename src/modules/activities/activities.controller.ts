import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ActivitiesService } from './activities.service.js';

export const activitySearchSchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

@ApiTags('activities')
@ApiBearerAuth()
@Roles('NUTRITIONIST')
@Controller('activities')
export class ActivitiesController {
  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
  ) {}
  @Get()
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Nombre o categoría, sin distinguir acentos; máximo 100 caracteres',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({
    description:
      'Catálogo histórico paginado de solo lectura, sin validación clínica.',
  })
  list(
    @Query(new ZodValidationPipe(activitySearchSchema))
    query: z.infer<typeof activitySearchSchema>,
  ) {
    return this.activities.search(query);
  }
}
