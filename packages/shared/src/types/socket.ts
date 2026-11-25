import type { ItemRarity } from '../constants/rarities.js';
import type {
  CaseBattleDTO,
  CaseBattleMode,
  CrashPlayerBetDTO,
  CrashSnapshotDTO,
  LiveRouletteBetDTO,
  LiveRouletteSnapshotDTO,
  RainSnapshotDTO,
  RouletteBetKind,
} from './games.js';
import type { GameType } from './models.js';

export interface LiveFeedEventDTO {
  id: string;
  type: 'CASE_DROP' | 'CASINO_WIN';
  username: string;
  isBot: boolean;
  gameType: GameType;
  title: string; // Nom de l'item ou du jeu
  subtitle: string; // Nom de la caisse ou multiplicateur
  amount: number; // Gain en centimes
  multiplier: number;
  rarity?: ItemRarity;
  imageUrl?: string;
  createdAt: string;
}

export interface ChatMessageDTO {
  id: string;
  userId: string;
  username: string;
  isGuest: boolean;
  text: string;
  createdAt: string;
}

export interface ServerToClientEvents {
  'server:online_count': (count: number) => void;
  'wallet:balance_update': (payload: { balance: number; reason?: string }) => void;
  'feed:new_event': (event: LiveFeedEventDTO) => void;
  'feed:history': (events: LiveFeedEventDTO[]) => void;
  'chat:history': (messages: ChatMessageDTO[]) => void;
  'chat:message': (message: ChatMessageDTO) => void;

  // Crash Temps Réel
  'crash:snapshot': (snapshot: CrashSnapshotDTO) => void;
  'crash:tick': (payload: { multiplier: number; elapsedMs: number; serverNow: number }) => void;
  'crash:player_bet': (bet: CrashPlayerBetDTO) => void;
  'crash:player_cashout': (payload: {
    betId: string;
    userId: string;
    username: string;
    cashedOutAt: number;
    payout: number;
  }) => void;

  // Case Battles Temps Réel
  'battles:list': (battles: CaseBattleDTO[]) => void;
  'battles:update': (battle: CaseBattleDTO) => void;

  // Roulette Live Multijoueur
  'roulette:snapshot': (snapshot: LiveRouletteSnapshotDTO) => void;
  'roulette:player_bet': (bet: LiveRouletteBetDTO) => void;

  // Chat Rain Automatique
  'rain:snapshot': (snapshot: RainSnapshotDTO) => void;
}

export interface ClientToServerEvents {
  'chat:send': (
    payload: { text: string },
    ack?: (res: { ok: boolean; error?: string }) => void
  ) => void;
  'crash:request_snapshot': () => void;
  'crash:place_bet': (
    payload: { wager: number; autoCashoutAt?: number | null },
    ack: (res: { ok: boolean; error?: string; newBalance?: number }) => void
  ) => void;
  'crash:cashout': (
    ack: (res: { ok: boolean; error?: string; cashedOutAt?: number; payout?: number; newBalance?: number }) => void
  ) => void;

  // Case Battles
  'battles:request_list': () => void;
  'battles:create': (
    payload: {
      mode: CaseBattleMode;
      reverseMode: boolean;
      fastMode: boolean;
      caseSlugs: string[];
    },
    ack: (res: { ok: boolean; error?: string; battleId?: string; newBalance?: number }) => void
  ) => void;
  'battles:join': (
    payload: { battleId: string; slotIndex?: number },
    ack: (res: { ok: boolean; error?: string; newBalance?: number }) => void
  ) => void;
  'battles:call_bots': (
    payload: { battleId: string },
    ack: (res: { ok: boolean; error?: string }) => void
  ) => void;

  // Roulette Live Multijoueur
  'roulette:request_snapshot': () => void;
  'roulette:place_bet': (
    payload: { wager: number; betKind: RouletteBetKind; betNumber?: number },
    ack: (res: { ok: boolean; error?: string; newBalance?: number }) => void
  ) => void;

  // Chat Rain
  'rain:request_snapshot': () => void;
  'rain:join': (ack: (res: { ok: boolean; error?: string }) => void) => void;
  'rain:tip': (
    payload: { amountCents: number },
    ack: (res: { ok: boolean; error?: string; newBalance?: number }) => void
  ) => void;
}
