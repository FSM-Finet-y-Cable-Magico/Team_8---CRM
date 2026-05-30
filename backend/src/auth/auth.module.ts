import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
