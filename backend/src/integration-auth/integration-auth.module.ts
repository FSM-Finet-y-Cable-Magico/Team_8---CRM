import { Module } from '@nestjs/common';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';

@Module({ providers: [IntegrationApiKeyGuard], exports: [IntegrationApiKeyGuard] })
export class IntegrationAuthModule {}

