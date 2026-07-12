import { Module } from '@nestjs/common';
import { MondayWebhooksController } from './monday-webhooks.controller';

@Module({
  controllers: [MondayWebhooksController],
})
export class MondayWebhooksModule {}
