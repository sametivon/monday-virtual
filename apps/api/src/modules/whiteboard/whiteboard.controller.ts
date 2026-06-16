import { Controller, Get, Param } from '@nestjs/common';
import { Permission, type WhiteboardDrawOp } from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { WhiteboardService } from './whiteboard.service';

@Controller('whiteboard')
export class WhiteboardController {
  constructor(private readonly whiteboard: WhiteboardService) {}

  /** Board history; viewing only needs space access (editing is gated at the gateway). */
  @RequirePermissions(Permission.SPACE_VIEW)
  @Get(':objectId/ops')
  ops(
    @CurrentUser() user: RequestUser,
    @Param('objectId') objectId: string,
  ): Promise<WhiteboardDrawOp[]> {
    return this.whiteboard.ops(user.tenantId, objectId);
  }
}
