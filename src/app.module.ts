import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PatientsModule } from './modules/patients/patients.module.js';
import { ConsultationsModule } from './modules/consultations/consultations.module.js';
import { MenusModule } from './modules/menus/menus.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { FoodsModule } from './modules/foods/foods.module.js';
import { ActivitiesModule } from './modules/activities/activities.module.js';
import { SupportModule } from './modules/support/support.module.js';
import { AdminModule } from './modules/admin/admin.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Solo el entorno npm usa .env.local; Docker lo excluye de la imagen.
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    PatientsModule,
    ConsultationsModule,
    MenusModule,
    AppointmentsModule,
    DashboardModule,
    FoodsModule,
    ActivitiesModule,
    SupportModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
