import { Router } from 'express';
import { z } from 'zod';
import { ECONOMY, rollLimboMultiplier, type LimboBetResponse } from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { ensureActiveSeed } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

const limboSchema = z.object({
  wager: z.number().int().min(ECONOMY.MIN_WAGER).max(ECONOMY.MAX_WAGER),
  targetMultiplier: z.number().min(1.01).max(100000),
});

export const limboRouter = Router();

limboRouter.post('/bet', requireAuth, async (req, res) => {
  try {
    const parsed = limboSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Paramètres Limbo invalides.' });
      return;
    }

    const userId = req.user!.userId;
    const wager = parsed.data.wager;
    const targetMultiplier = Math.round(parsed.data.targetMultiplier * 100) / 100;

    const result = await prisma.$transaction(async (tx) => {
      const [user, seed] = await Promise.all([
        tx.user.findUnique({ where: { id: userId } }),
        ensureActiveSeed(tx, userId),
      ]);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

      const nonceUsed = seed.nonce;
      const resultMultiplier = rollLimboMultiplier(
        seed.serverSeed,
        seed.clientSeed,
        nonceUsed
      );
      const won = resultMultiplier >= targetMultiplier;
      const payout = won ? Math.round(wager * targetMultiplier) : 0;
      const profit = payout - wager;

      const [, updatedUser, bet] = await Promise.all([
        tx.fairnessSeed.update({
          where: { id: seed.id },
          data: { nonce: { increment: 1 } },
        }),
        tx.user.update({
          where: { id: userId },
          data: {
            balance: { increment: profit },
            totalWagered: { increment: wager },
            totalWon: { increment: payout },
          },
        }),
        tx.betHistory.create({
          data: {
            userId,
            gameType: 'LIMBO',
            status: won ? 'WON' : 'LOST',
            wager,
            multiplier: won ? targetMultiplier : 0,
            payout,
            profit,
            fairnessSeedId: seed.id,
            nonceUsed,
            gameData: JSON.stringify({ targetMultiplier, resultMultiplier }),
          },
        }),
      ]);

      return {
        betId: bet.id,
        username: user.username,
        resultMultiplier,
        won,
        payout,
        profit,
        nonceUsed,
        newBalance: updatedUser.balance,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'LIMBO');

    if (result.won && targetMultiplier >= 3 && result.payout >= 1000) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'LIMBO',
        title: 'Limbo Originals',
        subtitle: `Cible ${targetMultiplier.toFixed(2)}× (Roll ${result.resultMultiplier.toFixed(2)}×)`,
        amount: result.payout,
        multiplier: targetMultiplier,
        createdAt: new Date().toISOString(),
      });
    }

    const response: LimboBetResponse = {
      betId: result.betId,
      wager,
      targetMultiplier,
      resultMultiplier: result.resultMultiplier,
      won: result.won,
      payout: result.payout,
      profit: result.profit,
      nonceUsed: result.nonceUsed,
      newBalance: result.newBalance,
    };
    res.json(response);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ error: 'Solde insuffisant.' });
      return;
    }
    console.error('Limbo error:', err);
    res.status(500).json({ error: 'Erreur Limbo.' });
  }
});
