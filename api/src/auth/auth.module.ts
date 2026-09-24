import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { RolesGuard } from './roles.guard';
import { TrustedOriginGuard } from './trusted-origin.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, FirebaseAuthGuard, RolesGuard, TrustedOriginGuard],
  exports: [AuthService, FirebaseAuthGuard, RolesGuard],
})
export class AuthModule {}
