import { Module } from '@nestjs/common';
import {
  SupportController,
  AdminSupportController,
} from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
