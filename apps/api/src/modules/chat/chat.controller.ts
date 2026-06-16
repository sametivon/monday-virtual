import { Controller, Get, Query } from '@nestjs/common';
import {
  ChatHistoryQuerySchema,
  type ChatHistoryQuery,
  type ChatMessageBroadcast,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('history')
  history(
    @CurrentUser() user: RequestUser,
    @Query(new ZodBody(ChatHistoryQuerySchema)) query: ChatHistoryQuery,
  ): Promise<ChatMessageBroadcast[]> {
    return this.chat.history(user.tenantId, user.sub, query);
  }
}
