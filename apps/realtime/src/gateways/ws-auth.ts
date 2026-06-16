import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { AppJwtPayload, SocketAuthData } from '@mvs/shared';

/**
 * Authenticates a Socket.IO handshake. Expects the client to send the app
 * access token plus the target spaceId via `socket.handshake.auth`. The token
 * is verified with JWT_SECRET (same secret the API signs with); tenantId and
 * permissions come from the token, never from the client — so a socket can
 * only ever act within its own tenant.
 */
export function authenticateSocket(socket: Socket, jwtSecret: string): SocketAuthData {
  const { token, spaceId } = (socket.handshake.auth ?? {}) as {
    token?: string;
    spaceId?: string;
  };
  if (!token) throw new Error('Missing auth token');
  if (!spaceId) throw new Error('Missing spaceId');

  let payload: AppJwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret) as AppJwtPayload;
  } catch {
    throw new Error('Invalid or expired token');
  }

  return {
    userId: payload.sub,
    tenantId: payload.tenantId,
    spaceId,
    name: payload.name,
    permissions: payload.permissions ?? [],
  };
}
