import { Module } from '@nestjs/common';
import { MessagingConfig } from './messaging.config';
import { MessagingService } from './messaging.service';
import { MetaWebhookController } from './meta-webhook.controller';
@Module({providers:[MessagingConfig,MessagingService],controllers:[MetaWebhookController],exports:[MessagingService]})
export class MessagingModule {}
