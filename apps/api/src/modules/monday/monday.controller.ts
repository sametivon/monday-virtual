import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  MondayBoardRequestSchema,
  MondaySeamlessRequestSchema,
  Permission,
  type MondayBoardData,
  type MondayBoardRequest,
  type MondayBoardSummary,
  type MondaySeamlessRequest,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { MondayService } from './monday.service';

@Controller('monday')
export class MondayController {
  constructor(private readonly monday: MondayService) {}

  @RequirePermissions(Permission.MONDAY_READ)
  @Get('boards/:boardId')
  board(
    @CurrentUser() user: RequestUser,
    @Param('boardId') boardId: string,
  ): Promise<MondayBoardData> {
    return this.monday.getBoard(user.tenantId, boardId);
  }

  /** Seamless (iframe) variants — POST because the sessionToken rides the body. */
  @RequirePermissions(Permission.MONDAY_READ)
  @Post('boards/list')
  boards(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(MondaySeamlessRequestSchema)) dto: MondaySeamlessRequest,
  ): Promise<MondayBoardSummary[]> {
    return this.monday.listBoardsSeamless(user.tenantId, dto.sessionToken);
  }

  @RequirePermissions(Permission.MONDAY_READ)
  @Post('board-data')
  boardData(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(MondayBoardRequestSchema)) dto: MondayBoardRequest,
  ): Promise<MondayBoardData> {
    return this.monday.getBoardSeamless(user.tenantId, dto.sessionToken, dto.boardId);
  }
}
