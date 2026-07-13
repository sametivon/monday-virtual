import { Module } from '@nestjs/common';
import { EventReminderService } from './event-reminder.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventReminderService],
  exports: [EventsService],
})
export class EventsModule {}
