import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [PatientsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
