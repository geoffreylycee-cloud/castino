import type { KenoRisk, PlayingCard, PlinkoRisk, PlinkoRows } from '../fairness/rng.js';
import type { InventoryItemDTO, ItemDTO } from './models.js';

// ================= CASE OPENING =================
export interface CaseOpenResponse {
  betId: string;
  rollTicket: number;
  nonceUsed: number;
  wonItem: ItemDTO;
  inventoryItem: InventoryItemDTO;
  reelItems: ItemDTO[];
  winningIndex: number;
  newBalance: number;
}

// ================= DICE =================
export type DiceCondition = 'OVER' | 'UNDER';

export interface DiceRollRequest {
  wager: number;
  target: number; // 2 à 98
  condition: DiceCondition;
}

export interface DiceRollResponse {
  betId: string;
  roll: number;
  target: number;
  condition: DiceCondition;
  won: boolean;
  multiplier: number;
  wager: number;
  payout: number;
  profit: number;
  nonceUsed: number;
  newBalance: number;
}

// ================= MINES =================
export interface MinesActiveGameDTO {
  betId: string;
  wager: number;
  minesCount: number;
  revealedTiles: number[];
  currentMultiplier: number;
  nextMultiplier: number;
  currentPayout: number;
  status: 'ACTIVE' | 'WON' | 'LOST';
  minePositions?: number[]; // Uniquement transmis quand status !== 'ACTIVE'
  hitMineIndex?: number;
}

// ================= BLACKJACK =================
export type BlackjackAction = 'HIT' | 'STAND' | 'DOUBLE';
export type BlackjackOutcome = 'PLAYING' | 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE';

export interface BlackjackStateDTO {
  betId: string;
  wager: number;
  playerCards: PlayingCard[];
  dealerCards: PlayingCard[]; // Si PLAYING, la 2e carte du croupier est masquée { rank: '?', suit: ... } côté API
  dealerHiddenCount: number;
  playerEval: {
    total: number;
    display: string;
    isBlackjack: boolean;
    isBust: boolean;
  };
  dealerEval: {
    total: number;
    display: string;
    isBlackjack: boolean;
    isBust: boolean;
  };
  canDouble: boolean;
  outcome: BlackjackOutcome;
  multiplier: number;
  payout: number;
  newBalance?: number;
}

// ================= PLINKO =================
export interface PlinkoDropRequest {
  wager: number;
  rows: PlinkoRows;
  risk: PlinkoRisk;
}

export interface PlinkoDropResponse {
  betId: string;
  wager: number;
  rows: PlinkoRows;
  risk: PlinkoRisk;
  directions: (0 | 1)[];
  bucketIndex: number;
  multiplier: number;
  payout: number;
  profit: number;
  nonceUsed: number;
  newBalance: number;
}

// ================= CRASH =================
export type CrashStatus = 'WAITING' | 'RUNNING' | 'CRASHED';

export interface CrashPlayerBetDTO {
  betId: string;
  userId: string;
  username: string;
  wager: number;
  autoCashoutAt: number | null;
  cashedOutAt: number | null;
  payout: number | null;
  isBot?: boolean;
}

export interface CrashSnapshotDTO {
  roundId: string;
  roundNumber: number;
  status: CrashStatus;
  serverSeedHash: string;
  serverSeed?: string;
  publicSeed: string;
  waitingEndsAt?: number;
  startedAt?: number;
  serverNow: number;
  currentMultiplier: number;
  crashPoint?: number;
  bets: CrashPlayerBetDTO[];
  history: {
    roundNumber: number;
    crashPoint: number;
    serverSeedHash: string;
  }[];
}

// ================= LIMBO =================
export interface LimboBetResponse {
  betId: string;
  wager: number;
  targetMultiplier: number;
  resultMultiplier: number;
  won: boolean;
  payout: number;
  profit: number;
  nonceUsed: number;
  newBalance: number;
}

// ================= ROULETTE =================
export type RouletteBetKind =
  | 'RED'
  | 'BLACK'
  | 'GREEN'
  | 'EVEN'
  | 'ODD'
  | 'LOW'
  | 'HIGH'
  | 'DOZEN_1'
  | 'DOZEN_2'
  | 'DOZEN_3'
  | 'NUMBER';

export interface RouletteSpinResponse {
  betId: string;
  wager: number;
  betKind: RouletteBetKind;
  betNumber?: number;
  winningNumber: number;
  winningColor: 'GREEN' | 'RED' | 'BLACK';
  won: boolean;
  multiplier: number;
  payout: number;
  profit: number;
  nonceUsed: number;
  newBalance: number;
}

export type LiveRouletteStatus = 'BETTING' | 'SPINNING' | 'RESULT';

export interface LiveRouletteBetDTO {
  betId: string;
  userId: string;
  username: string;
  wager: number;
  betKind: RouletteBetKind;
  betNumber?: number;
  won?: boolean;
  multiplier?: number;
  payout?: number;
}

export interface LiveRouletteSnapshotDTO {
  roundNumber: number;
  status: LiveRouletteStatus;
  serverSeedHash: string;
  serverSeed?: string;
  publicSeed: string;
  bettingEndsAt?: number;
  spinStartedAt?: number;
  serverNow: number;
  winningNumber?: number;
  winningColor?: 'GREEN' | 'RED' | 'BLACK';
  bets: LiveRouletteBetDTO[];
  history: {
    roundNumber: number;
    winningNumber: number;
    winningColor: 'GREEN' | 'RED' | 'BLACK';
  }[];
}

// ================= CHAT RAIN =================
export type RainStatus = 'COOLDOWN' | 'ACTIVE';

export interface RainSnapshotDTO {
  id: string;
  status: RainStatus;
  potCents: number;
  participants: {
    userId: string;
    username: string;
  }[];
  endsAt: number; // Si ACTIVE : fin de la Rain ; si COOLDOWN : début de la prochaine Rain auto
  serverNow: number;
  startedBy: string; // "Auto" ou "Admin"
}

// ================= KENO =================
export interface KenoPlayResponse {
  betId: string;
  wager: number;
  risk: KenoRisk;
  selectedNumbers: number[];
  drawnNumbers: number[];
  hits: number[];
  multiplier: number;
  payout: number;
  profit: number;
  nonceUsed: number;
  newBalance: number;
}

// ================= HILO =================
export type HiLoGuess = 'HIGHER' | 'LOWER' | 'SKIP';

export interface HiLoStateDTO {
  betId: string;
  wager: number;
  cards: PlayingCard[];
  currentCard: PlayingCard;
  currentMultiplier: number;
  currentPayout: number;
  skipsRemaining: number;
  status: 'ACTIVE' | 'WON' | 'LOST';
  odds: {
    higherLabel: string;
    lowerLabel: string;
    higherChance: number;
    lowerChance: number;
    higherMultiplier: number;
    lowerMultiplier: number;
  };
  newBalance?: number;
}

// ================= UPGRADER (Style Hellcase) =================
export type UpgraderRollMode = 'UNDER' | 'OVER';

export interface UpgraderPlayResponse {
  betId: string;
  won: boolean;
  roll: number; // 0.000 à 99.999
  chancePercent: number; // 1.000 à 80.000
  rollMode: UpgraderRollMode;
  totalInputValue: number;
  multiplier: number;
  targetItem: ItemDTO;
  wonInventoryItem: InventoryItemDTO | null;
  newBalance: number;
  nonceUsed: number;
}

// ================= CASE BATTLES =================
export type CaseBattleMode = '1v1' | '1v1v1' | '1v1v1v1' | '2v2' | '3v3';
export type CaseBattleStatus = 'WAITING' | 'RUNNING' | 'FINISHED';

export interface CaseBattleCaseSummary {
  caseId: string;
  slug: string;
  name: string;
  imageUrl: string;
  price: number;
}

export interface CaseBattleSlotDTO {
  slotIndex: number;
  team: number; // En solo : team === slotIndex ; en 2v2 / 3v3 : 0 (Bleu) ou 1 (Rouge)
  userId: string | null;
  username: string | null;
  isBot: boolean;
  totalValue: number;
  drops: ItemDTO[];
}

export interface CaseBattleRoundSpinDTO {
  roundIndex: number;
  caseSummary: CaseBattleCaseSummary;
  spins: {
    slotIndex: number;
    wonItem: ItemDTO;
    rollTicket: number;
    reelItems: ItemDTO[];
    winningIndex: number;
  }[];
}

export interface CaseBattleDTO {
  id: string;
  creatorUserId: string;
  mode: CaseBattleMode;
  isTeamMode: boolean;
  maxPlayers: number;
  reverseMode: boolean;
  fastMode: boolean;
  status: CaseBattleStatus;
  totalCost: number;
  cases: CaseBattleCaseSummary[];
  slots: CaseBattleSlotDTO[];
  currentRoundIndex: number; // -1 si WAITING
  activeRoundSpin: CaseBattleRoundSpinDTO | null;
  winnerTeam: number | null;
  winnerSlotIndices: number[];
  totalPotValue: number;
  payoutPerWinner: number;
  serverSeedHash: string;
  serverSeed?: string;
  createdAt: string;
}
