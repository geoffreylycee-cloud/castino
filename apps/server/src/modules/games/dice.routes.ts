import { Router } from 'express';
import { z } from 'zod';
import { ECONOMY, rollDiceOutcome, type DiceRollResponse } from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { consumeFairnessNonce, ensureActiveSeed } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

const diceSchema = z.object({
  wager: z.number().int().min(ECONOMY.MIN_WAGER).max(ECONOMY.MAX_WAGER),
  target: z.number().min(2).max(98),
  condition: z.enum(['OVER', 'UNDER']),
});

export const diceRouter = Router();

diceRouter.post('/roll', requireAuth, async (req, res) => {
  try {
    const parsed = diceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Paramètres de mise invalides.' });
      return;
    }

    const userId = req.user!.userId;
    const { wager, condition } = parsed.data;
    const target = Math.round(parsed.data.target * 100) / 100;

    const winChance = condition === 'UNDER' ? target : 100 - target;
    const multiplier = Math.floor((99 / winChance) * 10000) / 10000;

    const result = await prisma.$transaction(async (tx) => {
      const [user, seed] = await Promise.all([
        tx.user.findUnique({ where: { id: userId } }),
        ensureActiveSeed(tx, userId),
      ]);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

      const nonceUsed = seed.nonce;
      const roll = rollDiceOutcome(seed.serverSeed, seed.clientSeed, nonceUsed);
      const won = condition === 'UNDER' ? roll < target : roll > target;

      const payout = won ? Math.round(wager * multiplier) : 0;
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
            gameType: 'DICE',
            status: won ? 'WON' : 'LOST',
            wager,
            multiplier: won ? multiplier : 0,
            payout,
            profit,
            fairnessSeedId: seed.id,
            nonceUsed,
            gameData: JSON.stringify({ target, condition, roll, winChance }),
          },
        }),
      ]);

      return {
        username: user.username,
        betId: bet.id,
        roll,
        won,
        payout,
        profit,
        nonceUsed,
        newBalance: updatedUser.balance,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'DICE');

    if (result.won && multiplier >= 2 && result.payout >= 1000) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'DICE',
        title: 'Dice Originals',
        subtitle: `${multiplier.toFixed(2)}x (${condition === 'OVER' ? '>' : '<'} ${target})`,
        amount: result.payout,
        multiplier,
        createdAt: new Date().toISOString(),
      });
    }

    const response: DiceRollResponse = {
      betId: result.betId,
      roll: result.roll,
      target,
      condition,
      won: result.won,
      multiplier,
      wager,
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
    console.error('Dice roll error:', err);
    res.status(500).json({ error: 'Erreur lors du lancer Dice.' });
  }
});
