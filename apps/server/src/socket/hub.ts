import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  LiveFeedEventDTO,
  ServerToClientEvents,
} from '@castino/shared';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

let ioInstance: TypedServer | null = null;
const recentFeedEvents: LiveFeedEventDTO[] = [];
const MAX_FEED_HISTORY = 35;

// Suivi du nombre de connexions actives par userId (pour savoir qui est en ligne)
const onlineUserSockets = new Map<string, number>();

export function setSocketServer(io: TypedServer): void {
  ioInstance = io;
}

export function getSocketServer(): TypedServer | null {
  return ioInstance;
}

export function markUserOnline(userId: string): void {
  onlineUserSockets.set(userId, (onlineUserSockets.get(userId) || 0) + 1);
}

export function markUserOffline(userId: string): void {
  const cur = onlineUserSockets.get(userId) || 0;
  if (cur <= 1) {
    onlineUserSockets.delete(userId);
  } else {
    onlineUserSockets.set(userId, cur - 1);
  }
}

export function getOnlineUserIds(): Set<string> {
  return new Set(onlineUserSockets.keys());
}

export function getRecentFeedEvents(): LiveFeedEventDTO[] {
  return recentFeedEvents;
}

export function emitBalanceUpdate(userId: string, balance: number, reason?: string): void {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit('wallet:balance_update', { balance, reason });
}

export function broadcastFeedEvent(event: LiveFeedEventDTO): void {
  recentFeedEvents.unshift(event);
  if (recentFeedEvents.length > MAX_FEED_HISTORY) {
    recentFeedEvents.pop();
  }
  if (!ioInstance) return;
  ioInstance.emit('feed:new_event', event);
}
