import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
@Module({
  imports: [PatientsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
