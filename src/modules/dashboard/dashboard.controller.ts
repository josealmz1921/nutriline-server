import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { PublicUser } from '../auth/auth.types.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles('NUTRITIONIST')
@Controller('dashboard')
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
  ) {}
  @Get()
  @ApiOkResponse({
    description:
      'Resumen propio consistente: totales históricos, cinco consultas registradas recientemente y cinco citas futuras. Listas acotadas con total explícito. Sin capturas clínicas ni resultados.',
  })
  summary(@CurrentUser() user: PublicUser) {
    return this.dashboard.summary(user);
  }
}
