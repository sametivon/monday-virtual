import { Injectable } from '@nestjs/common';
import type { WhiteboardDrawOp } from '@mvs/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Cap on replayed history until op-log compaction lands (Phase 3). */
const MAX_OPS = 5000;

@Injectable()
export class WhiteboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Full op log for a board, oldest first — the client replays it in order. */
  async ops(tenantId: string, objectId: string): Promise<WhiteboardDrawOp[]> {
    const rows = await this.prisma.forTenant(tenantId).whiteboardOp.findMany({
      where: { objectId },
      orderBy: { createdAt: 'asc' },
      take: MAX_OPS,
      select: { op: true },
    });
    return rows.map((r) => r.op as WhiteboardDrawOp);
  }
}
