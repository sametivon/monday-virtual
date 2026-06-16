import { Module } from '@nestjs/common';
import { WhiteboardController } from './whiteboard.controller';
import { WhiteboardService } from './whiteboard.service';

@Module({
  controllers: [WhiteboardController],
  providers: [WhiteboardService],
})
export class WhiteboardModule {}
