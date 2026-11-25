import { create } from 'zustand';
import type {
  CaseBattleDTO,
  ChatMessageDTO,
  CrashSnapshotDTO,
  LiveFeedEventDTO,
  LiveRouletteSnapshotDTO,
  RainSnapshotDTO,
} from '@castino/shared';
import { getSocket } from '../lib/socket';
import { useAuthStore } from './useAuthStore';

interface RealtimeState {
  connected: boolean;
  onlineCount: number;
  feedEvents: LiveFeedEventDTO[];
  chatMessages: ChatMessageDTO[];
  crashSnapshot: CrashSnapshotDTO | null;
  liveCrashMultiplier: number;
  serverClockOffsetMs: number;
  rouletteSnapshot: LiveRouletteSnapshotDTO | null;
  rainSnapshot: RainSnapshotDTO | null;
  battles: CaseBattleDTO[];
  initialized: boolean;
  bindSocketEvents: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  connected: false,
  onlineCount: 1,
  feedEvents: [],
  chatMessages: [],
  crashSnapshot: null,
  liveCrashMultiplier: 1.0,
  serverClockOffsetMs: 0,
  rouletteSnapshot: null,
  rainSnapshot: null,
  battles: [],
  initialized: false,

  bindSocketEvents: () => {
    if (get().initialized) return;
    set({ initialized: true });

    const socket = getSocket();

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('server:online_count', (onlineCount) => set({ onlineCount }));

    socket.on('wallet:balance_update', ({ balance }) => {
      useAuthStore.getState().setBalance(balance);
    });

    socket.on('feed:history', (events) => set({ feedEvents: events }));
    socket.on('feed:new_event', (ev) =>
      set((s) => ({ feedEvents: [ev, ...s.feedEvents].slice(0, 35) }))
    );

    socket.on('chat:history', (messages) => set({ chatMessages: messages }));
    socket.on('chat:message', (msg) =>
      set((s) => ({ chatMessages: [...s.chatMessages, msg].slice(-60) }))
    );

    socket.on('crash:snapshot', (snapshot) => {
      const offset = snapshot.serverNow - Date.now();
      set({
        crashSnapshot: snapshot,
        liveCrashMultiplier: snapshot.currentMultiplier,
        serverClockOffsetMs: offset,
      });
    });

    socket.on('crash:tick', ({ multiplier, serverNow }) => {
      set({
        liveCrashMultiplier: multiplier,
        serverClockOffsetMs: serverNow - Date.now(),
      });
    });

    socket.on('crash:player_bet', (bet) => {
      set((s) => {
        if (!s.crashSnapshot) return s;
        const exists = s.crashSnapshot.bets.some((b) => b.betId === bet.betId);
        if (exists) return s;
        return {
          crashSnapshot: {
            ...s.crashSnapshot,
            bets: [...s.crashSnapshot.bets, bet],
          },
        };
      });
    });

    socket.on('crash:player_cashout', ({ betId, cashedOutAt, payout }) => {
      set((s) => {
        if (!s.crashSnapshot) return s;
        return {
          crashSnapshot: {
            ...s.crashSnapshot,
            bets: s.crashSnapshot.bets.map((b) =>
              b.betId === betId ? { ...b, cashedOutAt, payout } : b
            ),
          },
        };
      });
    });

    socket.on('battles:list', (battles) => set({ battles }));
    socket.on('battles:update', (battle) =>
      set((s) => {
        const exists = s.battles.some((b) => b.id === battle.id);
        return {
          battles: exists
            ? s.battles.map((b) => (b.id === battle.id ? battle : b))
            : [battle, ...s.battles],
        };
      })
    );

    socket.on('roulette:snapshot', (snapshot) =>
      set({
        rouletteSnapshot: snapshot,
        serverClockOffsetMs: snapshot.serverNow - Date.now(),
      })
    );

    socket.on('roulette:player_bet', (bet) =>
      set((s) => {
        if (!s.rouletteSnapshot) return s;
        if (s.rouletteSnapshot.bets.some((b) => b.betId === bet.betId)) return s;
        return {
          rouletteSnapshot: {
            ...s.rouletteSnapshot,
            bets: [...s.rouletteSnapshot.bets, bet],
          },
        };
      })
    );

    socket.on('rain:snapshot', (rainSnapshot) =>
      set({
        rainSnapshot,
        serverClockOffsetMs: rainSnapshot.serverNow - Date.now(),
      })
    );
  },
}));
