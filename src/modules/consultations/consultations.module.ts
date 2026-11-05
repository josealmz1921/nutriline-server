import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module.js';
import { ConsultationsController } from './consultations.controller.js';
import { ConsultationsService } from './consultations.service.js';

@Module({
  imports: [PatientsModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
})
export class ConsultationsModule {}
