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
import { FoodsService } from './foods.service.js';

export const foodSearchSchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

@ApiTags('foods')
@ApiBearerAuth()
@Roles('NUTRITIONIST')
@Controller('foods')
export class FoodsController {
  constructor(@Inject(FoodsService) private readonly foods: FoodsService) {}
  @Get()
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Búsqueda sin distinguir acentos, máximo 100 caracteres',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: '1–50, por defecto 20',
  })
  @ApiOkResponse({
    description:
      'Catálogo histórico paginado, solo lectura. No incluye nutrientes validados ni conversiones.',
  })
  list(
    @Query(new ZodValidationPipe(foodSearchSchema))
    query: z.infer<typeof foodSearchSchema>,
  ) {
    return this.foods.search(query);
  }
}
