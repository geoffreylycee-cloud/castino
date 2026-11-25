import { Router } from 'express';
import { z } from 'zod';
import {
  ECONOMY,
  drawBlackjackCard,
  getHiLoOdds,
  getHiLoRankValue,
  type HiLoStateDTO,
  type PlayingCard,
} from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { consumeFairnessNonce } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

interface StoredHiLoGame {
  cards: PlayingCard[];
  currentMultiplier: number;
  skipsRemaining: number;
  cursor: number;
  serverSeed: string;
  clientSeed: string;
  nonceUsed: number;
}

const startHiLoSchema = z.object({
  wager: z.number().int().min(ECONOMY.MIN_WAGER).max(ECONOMY.MAX_WAGER),
});

const guessSchema = z.object({
  guess: z.enum(['HIGHER', 'LOWER', 'SKIP']),
});

function toHiLoDTO(
  betId: string,
  wager: number,
  status: 'ACTIVE' | 'WON' | 'LOST',
  stored: StoredHiLoGame,
  newBalance?: number
): HiLoStateDTO {
  const currentCard = stored.cards[stored.cards.length - 1];
  const mult = status === 'LOST' ? 0 : Math.floor(stored.currentMultiplier * 100) / 100;
  return {
    betId,
    wager,
    cards: stored.cards,
    currentCard,
    currentMultiplier: mult,
    currentPayout: status === 'LOST' ? 0 : Math.round(wager * mult),
    skipsRemaining: stored.skipsRemaining,
    status,
    odds: getHiLoOdds(currentCard.rank),
    newBalance,
  };
}

export const hiloRouter = Router();

hiloRouter.get('/active', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const active = await prisma.betHistory.findFirst({
      where: { userId, gameType: 'HILO', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) {
      res.json({ game: null });
      return;
    }
    const stored = JSON.parse(active.gameData) as StoredHiLoGame;
    res.json({ game: toHiLoDTO(active.id, active.wager, 'ACTIVE', stored) });
  } catch (err) {
    console.error('HiLo active error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

hiloRouter.post('/start', requireAuth, async (req, res) => {
  try {
    const parsed = startHiLoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Mise invalide.' });
      return;
    }
    const userId = req.user!.userId;
    const { wager } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.betHistory.findFirst({
        where: { userId, gameType: 'HILO', status: 'ACTIVE' },
      });
      if (existing) throw new Error('GAME_ALREADY_ACTIVE');

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

      const fairness = await consumeFairnessNonce(tx, userId);
      const startCard = drawBlackjackCard(
        fairness.serverSeed,
        fairness.clientSeed,
        fairness.nonceUsed,
        0
      );

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: wager },
          totalWagered: { increment: wager },
        },
      });

      const stored: StoredHiLoGame = {
        cards: [startCard],
        currentMultiplier: 1,
        skipsRemaining: 5,
        cursor: 1,
        serverSeed: fairness.serverSeed,
        clientSeed: fairness.clientSeed,
        nonceUsed: fairness.nonceUsed,
      };

      const bet = await tx.betHistory.create({
        data: {
          userId,
          gameType: 'HILO',
          status: 'ACTIVE',
          wager,
          multiplier: 1,
          payout: 0,
          profit: -wager,
          fairnessSeedId: fairness.seedId,
          nonceUsed: fairness.nonceUsed,
          gameData: JSON.stringify(stored),
        },
      });

      return { betId: bet.id, stored, newBalance: updatedUser.balance };
    });

    emitBalanceUpdate(userId, result.newBalance, 'HILO_START');
    res.json({ game: toHiLoDTO(result.betId, wager, 'ACTIVE', result.stored, result.newBalance) });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ error: 'Solde insuffisant.' });
        return;
      }
      if (err.message === 'GAME_ALREADY_ACTIVE') {
        res.status(400).json({ error: 'Une série HiLo est déjà en cours.' });
        return;
      }
    }
    console.error('HiLo start error:', err);
    res.status(500).json({ error: 'Erreur HiLo.' });
  }
});

hiloRouter.post('/guess', requireAuth, async (req, res) => {
  try {
    const parsed = guessSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Choix invalide.' });
      return;
    }

    const userId = req.user!.userId;
    const { guess } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const bet = await tx.betHistory.findFirst({
        where: { userId, gameType: 'HILO', status: 'ACTIVE' },
      });
      if (!bet) throw new Error('NO_ACTIVE_GAME');

      const stored = JSON.parse(bet.gameData) as StoredHiLoGame;
      const currentCard = stored.cards[stored.cards.length - 1];
      const nextCard = drawBlackjackCard(
        stored.serverSeed,
        stored.clientSeed,
        stored.nonceUsed,
        stored.cursor
      );
      stored.cursor += 1;

      if (guess === 'SKIP') {
        if (stored.skipsRemaining <= 0) throw new Error('NO_SKIPS_LEFT');
        stored.skipsRemaining -= 1;
        stored.cards.push(nextCard);
        await tx.betHistory.update({
          where: { id: bet.id },
          data: { gameData: JSON.stringify(stored) },
        });
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return { betId: bet.id, wager: bet.wager, status: 'ACTIVE' as const, stored, newBalance: user.balance };
      }

      const curVal = getHiLoRankValue(currentCard.rank);
      const nextVal = getHiLoRankValue(nextCard.rank);
      const odds = getHiLoOdds(currentCard.rank);

      let wonStep = false;
      let stepMult = 1;

      if (guess === 'HIGHER') {
        wonStep = curVal === 1 ? nextVal > 1 : curVal === 13 ? nextVal === 13 : nextVal >= curVal;
        stepMult = odds.higherMultiplier;
      } else {
        wonStep = curVal === 13 ? nextVal < 13 : curVal === 1 ? nextVal === 1 : nextVal <= curVal;
        stepMult = odds.lowerMultiplier;
      }

      stored.cards.push(nextCard);

      if (!wonStep) {
        stored.currentMultiplier = 0;
        await tx.betHistory.update({
          where: { id: bet.id },
          data: {
            status: 'LOST',
            multiplier: 0,
            payout: 0,
            profit: -bet.wager,
            gameData: JSON.stringify(stored),
          },
        });
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return { betId: bet.id, wager: bet.wager, status: 'LOST' as const, stored, newBalance: user.balance };
      }

      stored.currentMultiplier = Math.floor(stored.currentMultiplier * stepMult * 100) / 100;
      await tx.betHistory.update({
        where: { id: bet.id },
        data: {
          multiplier: stored.currentMultiplier,
          gameData: JSON.stringify(stored),
        },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      return { betId: bet.id, wager: bet.wager, status: 'ACTIVE' as const, stored, newBalance: user.balance };
    });

    res.json({ game: toHiLoDTO(result.betId, result.wager, result.status, result.stored, result.newBalance) });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NO_ACTIVE_GAME') {
        res.status(400).json({ error: 'Aucune partie HiLo en cours.' });
        return;
      }
      if (err.message === 'NO_SKIPS_LEFT') {
        res.status(400).json({ error: 'Plus de passages gratuits disponibles pour cette manche.' });
        return;
      }
    }
    console.error('HiLo guess error:', err);
    res.status(500).json({ error: 'Erreur HiLo.' });
  }
});

hiloRouter.post('/cashout', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
      const bet = await tx.betHistory.findFirst({
        where: { userId, gameType: 'HILO', status: 'ACTIVE' },
      });
      if (!bet) throw new Error('NO_ACTIVE_GAME');

      const stored = JSON.parse(bet.gameData) as StoredHiLoGame;
      if (stored.currentMultiplier <= 1) {
        throw new Error('NOTHING_TO_CASHOUT');
      }

      const multiplier = Math.floor(stored.currentMultiplier * 100) / 100;
      const payout = Math.round(bet.wager * multiplier);
      const profit = payout - bet.wager;

      await tx.betHistory.update({
        where: { id: bet.id },
        data: {
          status: 'WON',
          multiplier,
          payout,
          profit,
          gameData: JSON.stringify(stored),
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { increment: payout },
          totalWon: { increment: payout },
        },
      });

      return {
        betId: bet.id,
        wager: bet.wager,
        stored,
        multiplier,
        payout,
        newBalance: updatedUser.balance,
        username: updatedUser.username,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'HILO_CASHOUT');

    if (result.multiplier >= 2 && result.payout >= 1000) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'HILO',
        title: 'HiLo Originals',
        subtitle: `Série de ${result.stored.cards.length} cartes (${result.multiplier.toFixed(2)}×)`,
        amount: result.payout,
        multiplier: result.multiplier,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({ game: toHiLoDTO(result.betId, result.wager, 'WON', result.stored, result.newBalance) });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NO_ACTIVE_GAME') {
        res.status(400).json({ error: 'Aucune partie active.' });
        return;
      }
      if (err.message === 'NOTHING_TO_CASHOUT') {
        res.status(400).json({ error: 'Réussissez au moins un pronostic avant de faire Cashout.' });
        return;
      }
    }
    console.error('HiLo cashout error:', err);
    res.status(500).json({ error: 'Erreur Cashout HiLo.' });
  }
});
