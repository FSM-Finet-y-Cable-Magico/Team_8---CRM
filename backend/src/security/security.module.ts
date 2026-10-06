import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: {
          expiresIn: parseExpiresIn(config.get<string>('JWT_EXPIRES_IN')),
        },
      }),
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class SecurityModule {}

function resolveJwtSecret(config: ConfigService) {
  const secret = config.get<string>('JWT_SECRET') ?? '';
  const production = config.get<string>('NODE_ENV') === 'production';
  if (production && (secret.length < 32 || /change[_ -]?me|reemplazar|example|placeholder/i.test(secret))) {
    throw new Error('JWT_SECRET_INVALID');
  }
  return secret || 'change_me_in_local_env';
}

function parseExpiresIn(value?: string) {
  if (!value) {
    return 8 * 60 * 60;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const match = value.match(/^(\d+)([hm])$/i);

  if (!match) {
    return 8 * 60 * 60;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  return unit === 'h' ? amount * 60 * 60 : amount * 60;
}
