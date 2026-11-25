import type { ItemRarity } from '../constants/rarities.js';

export type GameType =
  | 'CASE_OPENING'
  | 'CRASH'
  | 'MINES'
  | 'DICE'
  | 'BLACKJACK'
  | 'PLINKO'
  | 'LIMBO'
  | 'ROULETTE'
  | 'KENO'
  | 'HILO'
  | 'UPGRADER'
  | 'CASE_BATTLE';
export type BetStatus = 'ACTIVE' | 'WON' | 'LOST';
export type InventoryStatus = 'IN_INVENTORY' | 'SOLD';

export type UserRole = 'USER' | 'ADMIN';

export interface UserDTO {
  id: string;
  username: string;
  role: UserRole;
  isGuest: boolean;
  isBanned: boolean;
  avatarSeed: string;
  balance: number;
  totalWagered: number;
  totalWon: number;
  lastFaucetAt: string | null;
  createdAt: string;
}

export interface FairnessSeedInfoDTO {
  id: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export interface RevealedSeedDTO {
  id: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  revealedAt: string;
}

export interface ItemDTO {
  id: string;
  name: string;
  slug: string;
  weaponOrCategory: string | null;
  imageUrl: string;
  rarity: ItemRarity;
  value: number;
}

export interface CaseItemDTO {
  id: string;
  weight: number;
  ticketStart: number;
  ticketEnd: number;
  chancePercent: number;
  item: ItemDTO;
}

export interface CaseDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string;
  price: number;
  category: string;
  items?: CaseItemDTO[];
}

export interface InventoryItemDTO {
  id: string;
  status: InventoryStatus;
  acquiredValue: number;
  soldValue: number | null;
  acquiredAt: string;
  item: ItemDTO;
  originCase?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface BetHistoryDTO {
  id: string;
  username: string;
  gameType: GameType;
  status: BetStatus;
  wager: number;
  multiplier: number;
  payout: number;
  profit: number;
  nonceUsed: number | null;
  createdAt: string;
}

export interface LeaderboardEntryDTO {
  rank: number;
  id: string;
  username: string;
  avatarSeed: string;
  balance: number;
  totalWagered: number;
  totalWon: number;
}
