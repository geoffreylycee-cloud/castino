import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@castino/shared';
import { getStoredToken } from './api';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

let socket: TypedClientSocket | null = null;

export function getSocket(): TypedClientSocket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: {
        token: getStoredToken(),
      },
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function refreshSocketAuth(): void {
  const s = getSocket();
  s.auth = { token: getStoredToken() };
  if (s.connected) {
    s.disconnect();
  }
  s.connect();
}
