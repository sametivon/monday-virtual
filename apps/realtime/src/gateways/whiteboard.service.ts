import { Injectable, Logger } from '@nestjs/common';
import { forTenant } from '@mvs/db';
import type { WhiteboardDrawOp } from '@mvs/shared';

/**
 * Whiteboard op persistence (Phase 2). Ops broadcast immediately and persist
 * fire-and-forget, same trade-off as chat: a failed write loses one op from
 * history, never adds latency to the live stroke.
 */
@Injectable()
export class WhiteboardService {
  private readonly logger = new Logger(WhiteboardService.name);

  persist(tenantId: string, objectId: string, userId: string, op: WhiteboardDrawOp): void {
    void forTenant(tenantId)
      .whiteboardOp.create({ data: { tenantId, objectId, userId, op } })
      .catch((err: Error) => this.logger.warn(`whiteboard persist failed: ${err.message}`));
  }
}
