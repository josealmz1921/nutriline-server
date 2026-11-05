import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';
import { PatientOwnershipService } from './patient-ownership.service.js';

@Module({
  controllers: [PatientsController],
  providers: [PatientsService, PatientOwnershipService],
  exports: [PatientOwnershipService],
})
export class PatientsModule {}
