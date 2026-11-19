import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module.js';
import { MenusController } from './menus.controller.js';
import { MenusService } from './menus.service.js';
@Module({
  imports: [PatientsModule],
  controllers: [MenusController],
  providers: [MenusService],
})
export class MenusModule {}
