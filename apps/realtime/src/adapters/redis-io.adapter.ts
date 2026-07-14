import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter backed by Redis pub/sub. With this, any realtime pod can
 * serve any client and broadcasts fan out across all pods — the horizontal
 * scaling primitive for presence/movement/chat (ARCHITECTURE §8).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pubClient = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: [this.corsOrigin], credentials: true },
      // Free-tier instances get throttled CPU; brief event-loop stalls must
      // not read as dead connections (default pingTimeout is 20s).
      pingInterval: 25000,
      pingTimeout: 60000,
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
