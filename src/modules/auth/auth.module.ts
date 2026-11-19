import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessGuard, OriginGuard, RolesGuard } from './auth.guards.js';
import { PasswordService } from './password.service.js';
import { PasswordSecurityService } from './password-security.service.js';
import { PasswordSecurityController } from './password-security.controller.js';
import { RecoveryMailer } from './recovery-mailer.service.js';

@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [AuthController, PasswordSecurityController],
  providers: [
    AuthService,
    PasswordService,
    PasswordSecurityService,
    RecoveryMailer,
    OriginGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
