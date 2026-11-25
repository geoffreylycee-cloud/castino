import { ECONOMY } from '../constants/economy.js';
import { hmacSha256Bytes, hmacSha256Hex, sha256Hex } from './sha256.js';

export { sha256Hex, hmacSha256Hex };

/**
 * Génère un flux infini de flottants uniformes dans [0, 1) façon Stake Provably Fair :
 * HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${round}`)
 * Chaque bloc de 4 octets génère un float haute précision :
 * sum(byte[i] / 256^(i+1)) pour i = 0..3
 */
export function generateFloats(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
  cursorStart = 0
): number[] {
  const results: number[] = [];
  let currentCursor = cursorStart;

  while (results.length < count) {
    const hmacRound = Math.floor(currentCursor / 8);
    const bytes = hmacSha256Bytes(serverSeed, `${clientSeed}:${nonce}:${hmacRound}`);
    let byteOffset = (currentCursor % 8) * 4;

    while (byteOffset < 32 && results.length < count) {
      const value =
        bytes[byteOffset] / 256 +
        bytes[byteOffset + 1] / 65536 +
        bytes[byteOffset + 2] / 16777216 +
        bytes[byteOffset + 3] / 4294967296;
      results.push(value);
      byteOffset += 4;
      currentCursor++;
    }
  }

  return results;
}

/**
 * Case Opening : tire un ticket entier entre 0 et 99 999 inclus
 */
export function rollCaseTicket(serverSeed: string, clientSeed: string, nonce: number): number {
  const [flt] = generateFloats(serverSeed, clientSeed, nonce, 1);
  return Math.floor(flt * ECONOMY.CASE_TOTAL_TICKETS);
}

/**
 * Dice : tire un nombre entre 0.00 et 100.00 (10 001 issues possibles façon Stake : 0.00 à 100.00)
 */
export function rollDiceOutcome(serverSeed: string, clientSeed: string, nonce: number): number {
  const [flt] = generateFloats(serverSeed, clientSeed, nonce, 1);
  return Math.floor(flt * 10001) / 100;
}

/**
 * Mines : mélange Fisher-Yates déterministe sur 25 tuiles (0..24) pour placer `minesCount` bombes
 */
export function generateMinePositions(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  minesCount: number
): number[] {
  const pool = Array.from({ length: 25 }, (_, i) => i);
  const floats = generateFloats(serverSeed, clientSeed, nonce, minesCount);
  const mines: number[] = [];

  for (let i = 0; i < minesCount; i++) {
    const idx = Math.floor(floats[i] * pool.length);
    mines.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return mines.sort((a, b) => a - b);
}

/**
 * Calcule le multiplicateur Mines exact (RTP 99%) après `revealedSafeCount` diamants trouvés
 */
export function calculateMinesMultiplier(minesCount: number, revealedSafeCount: number): number {
  if (revealedSafeCount <= 0) return 1;
  let prob = 1;
  for (let i = 0; i < revealedSafeCount; i++) {
    prob *= (25 - minesCount - i) / (25 - i);
  }
  const raw = 0.99 / prob;
  return Math.floor(raw * 100) / 100;
}

/**
 * Crash (Multijoueur) : calcule le point de crash à partir de serverSeed et publicSeed (RTP 99%)
 */
export function calculateCrashPoint(serverSeed: string, publicSeed: string): number {
  const hex = hmacSha256Hex(serverSeed, publicSeed);
  // 52 bits les plus significatifs (13 caractères hex)
  const h = parseInt(hex.slice(0, 13), 16);
  const e = Math.pow(2, 52);

  // ~1% de crash instantané à 1.00x (House Edge)
  if (h % 100 === 0) {
    return 1.0;
  }

  const raw = Math.floor((100 * e - h) / (e - h)) / 100;
  return Math.max(1.0, Math.min(raw, 10000));
}

/**
 * Courbe temporelle Crash : multiplicateur en fonction du temps écoulé (ms)
 */
export function crashMultiplierAtElapsedMs(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1.0;
  const seconds = elapsedMs / 1000;
  const m = Math.pow(Math.E, 0.065 * seconds);
  return Math.floor(m * 100) / 100;
}

/**
 * Temps exact (en ms) auquel la courbe atteint `targetMultiplier`
 */
export function crashDurationForMultiplierMs(targetMultiplier: number): number {
  if (targetMultiplier <= 1.0) return 0;
  return Math.ceil((Math.log(targetMultiplier) / 0.065) * 1000);
}

/**
 * Plinko : génère un tableau de directions (0 = Gauche, 1 = Droite) sur `rows` rangées
 */
export type PlinkoRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type PlinkoRows = 8 | 12 | 16;

export const PLINKO_MULTIPLIERS: Record<PlinkoRows, Record<PlinkoRisk, number[]>> = {
  8: {
    LOW: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    MEDIUM: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    HIGH: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    LOW: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    MEDIUM: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    HIGH: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    LOW: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    MEDIUM: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    HIGH: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

export function generatePlinkoPath(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: PlinkoRows
): { directions: (0 | 1)[]; bucketIndex: number } {
  const floats = generateFloats(serverSeed, clientSeed, nonce, rows);
  const directions = floats.map((f) => (f < 0.5 ? 0 : 1)) as (0 | 1)[];
  const bucketIndex = directions.reduce<number>((sum, d) => sum + d, 0);
  return { directions, bucketIndex };
}

/**
 * Blackjack : Sabot infini Provably Fair (52 cartes standard)
 */
export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface PlayingCard {
  rank: CardRank;
  suit: CardSuit;
  code: string;
}

const SUITS: CardSuit[] = ['diamonds', 'hearts', 'spades', 'clubs'];
const RANKS: CardRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function drawBlackjackCard(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor: number
): PlayingCard {
  const [flt] = generateFloats(serverSeed, clientSeed, nonce, 1, cursor);
  const cardIndex = Math.floor(flt * 52);
  const suit = SUITS[Math.floor(cardIndex / 13)];
  const rank = RANKS[cardIndex % 13];
  return { rank, suit, code: `${rank}-${suit}` };
}

export function evaluateBlackjackHand(cards: PlayingCard[]): {
  total: number;
  isSoft: boolean;
  isBlackjack: boolean;
  isBust: boolean;
  display: string;
} {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (['K', 'Q', 'J', '10'].includes(card.rank)) {
      total += 10;
    } else {
      total += parseInt(card.rank, 10);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  const isSoft = aces > 0 && total <= 21;
  const isBlackjack = cards.length === 2 && total === 21;
  const isBust = total > 21;
  const display =
    isBlackjack
      ? 'BJ (21)'
      : isSoft && total - 10 > 0 && total < 21
      ? `${total - 10} / ${total}`
      : `${total}`;

  return { total, isSoft, isBlackjack, isBust, display };
}

/**
 * Limbo (Stake Originals) : génère un multiplicateur dans [1.00, 1_000_000] (RTP 99%)
 */
export function rollLimboMultiplier(serverSeed: string, clientSeed: string, nonce: number): number {
  const [flt] = generateFloats(serverSeed, clientSeed, nonce, 1);
  const floatPoint = 1_000_000 / (flt * 1_000_000 + 1e-9);
  const withEdge = floatPoint * 0.99;
  const clamped = Math.max(1.0, Math.min(1_000_000, withEdge));
  return Math.floor(clamped * 100) / 100;
}

/**
 * Roulette Européenne (0 à 36) : génère un numéro exact entre 0 et 36
 */
export const ROULETTE_RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const ROULETTE_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export function getRouletteColor(num: number): 'GREEN' | 'RED' | 'BLACK' {
  if (num === 0) return 'GREEN';
  return ROULETTE_RED_NUMBERS.has(num) ? 'RED' : 'BLACK';
}

export function rollRouletteNumber(serverSeed: string, clientSeed: string, nonce: number): number {
  const [flt] = generateFloats(serverSeed, clientSeed, nonce, 1);
  return Math.floor(flt * 37);
}

/**
 * Keno (Stake Originals : 40 cases 1..40, 10 tirées)
 */
export type KenoRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export const KENO_PAYOUTS: Record<KenoRisk, Record<number, number[]>> = {
  LOW: {
    1: [0.7, 1.85],
    2: [0, 2, 3.8],
    3: [0, 1.1, 1.38, 26],
    4: [0, 0, 2.2, 7.9, 90],
    5: [0, 0, 1.5, 4.2, 13, 300],
    6: [0, 0, 1.1, 2, 6.2, 100, 700],
    7: [0, 0, 1.1, 1.6, 3.5, 15, 225, 700],
    8: [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800],
    9: [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000],
    10: [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000],
  },
  MEDIUM: {
    1: [0.4, 2.75],
    2: [0, 1.8, 5.1],
    3: [0, 0, 2.8, 50],
    4: [0, 0, 1.7, 10, 100],
    5: [0, 0, 1.4, 4, 14, 390],
    6: [0, 0, 0, 3, 9, 180, 710],
    7: [0, 0, 0, 2, 7, 30, 400, 800],
    8: [0, 0, 0, 2, 4, 11, 67, 400, 900],
    9: [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    10: [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000],
  },
  HIGH: {
    1: [0, 3.96],
    2: [0, 0, 17.1],
    3: [0, 0, 0, 81.5],
    4: [0, 0, 0, 10, 259],
    5: [0, 0, 0, 4.5, 48, 450],
    6: [0, 0, 0, 0, 11, 350, 710],
    7: [0, 0, 0, 0, 7, 90, 400, 800],
    8: [0, 0, 0, 0, 5, 20, 270, 600, 900],
    9: [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000],
    10: [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000],
  },
};

export function drawKenoNumbers(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const pool = Array.from({ length: 40 }, (_, i) => i + 1);
  const floats = generateFloats(serverSeed, clientSeed, nonce, 10);
  const drawn: number[] = [];

  for (let i = 0; i < 10; i++) {
    const idx = Math.floor(floats[i] * pool.length);
    drawn.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return drawn.sort((a, b) => a - b);
}

/**
 * HiLo (Stake Originals) : valeur numérique 1 (As) à 13 (Roi) + probabilités & multiplicateurs
 */
export function getHiLoRankValue(rank: CardRank): number {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank, 10);
}

export function getHiLoOdds(currentRank: CardRank): {
  higherLabel: string;
  lowerLabel: string;
  higherChance: number;
  lowerChance: number;
  higherMultiplier: number;
  lowerMultiplier: number;
} {
  const val = getHiLoRankValue(currentRank);
  // Règle Stake : si As (1), Higher = strictement > 1 (12/13), Same = 1 (1/13)
  // si Roi (13), Lower = strictement < 13 (12/13), Same = 13 (1/13)
  // sinon Higher or Same = (14 - val)/13, Lower or Same = val/13
  let highCount: number;
  let lowCount: number;
  let higherLabel = 'Plus Haut ou Égal';
  let lowerLabel = 'Plus Bas ou Égal';

  if (val === 1) {
    highCount = 12;
    lowCount = 1;
    higherLabel = 'Plus Haut';
    lowerLabel = 'Égal (As)';
  } else if (val === 13) {
    highCount = 1;
    lowCount = 12;
    higherLabel = 'Égal (Roi)';
    lowerLabel = 'Plus Bas';
  } else {
    highCount = 14 - val;
    lowCount = val;
  }

  const higherChance = +((highCount / 13) * 100).toFixed(2);
  const lowerChance = +((lowCount / 13) * 100).toFixed(2);
  const higherMultiplier = Math.floor((0.99 / (highCount / 13)) * 100) / 100;
  const lowerMultiplier = Math.floor((0.99 / (lowCount / 13)) * 100) / 100;

  return {
    higherLabel,
    lowerLabel,
    higherChance,
    lowerChance,
    higherMultiplier: Math.max(1.01, higherMultiplier),
    lowerMultiplier: Math.max(1.01, lowerMultiplier),
  };
}

