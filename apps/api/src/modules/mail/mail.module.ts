import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global like PlanModule: mail hooks live in auth + events without imports. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
