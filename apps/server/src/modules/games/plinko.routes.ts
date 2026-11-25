import { Router } from 'express';
import { z } from 'zod';
import {
  ECONOMY,
  PLINKO_MULTIPLIERS,
  generatePlinkoPath,
  type PlinkoDropResponse,
  type PlinkoRisk,
  type PlinkoRows,
} from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { consumeFairnessNonce } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

const plinkoSchema = z.object({
  wager: z.number().int().min(ECONOMY.MIN_WAGER).max(ECONOMY.MAX_WAGER),
  rows: z.union([z.literal(8), z.literal(12), z.literal(16)]),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export const plinkoRouter = Router();

plinkoRouter.post('/drop', requireAuth, async (req, res) => {
  try {
    const parsed = plinkoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Paramètres Plinko invalides.' });
      return;
    }

    const userId = req.user!.userId;
    const wager = parsed.data.wager;
    const rows = parsed.data.rows as PlinkoRows;
    const risk = parsed.data.risk as PlinkoRisk;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

      const fairness = await consumeFairnessNonce(tx, userId);
      const { directions, bucketIndex } = generatePlinkoPath(
        fairness.serverSeed,
        fairness.clientSeed,
        fairness.nonceUsed,
        rows
      );

      const multiplier = PLINKO_MULTIPLIERS[rows][risk][bucketIndex];
      const payout = Math.round(wager * multiplier);
      const profit = payout - wager;

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { increment: profit },
          totalWagered: { increment: wager },
          totalWon: { increment: payout },
        },
      });

      const bet = await tx.betHistory.create({
        data: {
          userId,
          gameType: 'PLINKO',
          status: multiplier >= 1 ? 'WON' : 'LOST',
          wager,
          multiplier,
          payout,
          profit,
          fairnessSeedId: fairness.seedId,
          nonceUsed: fairness.nonceUsed,
          gameData: JSON.stringify({ rows, risk, bucketIndex, directions }),
        },
      });

      return {
        betId: bet.id,
        username: user.username,
        directions,
        bucketIndex,
        multiplier,
        payout,
        profit,
        nonceUsed: fairness.nonceUsed,
        newBalance: updatedUser.balance,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'PLINKO');

    if (result.multiplier >= 4 && result.payout >= 1000) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'PLINKO',
        title: 'Plinko Originals',
        subtitle: `${result.multiplier}x (${risk} · ${rows} lignes)`,
        amount: result.payout,
        multiplier: result.multiplier,
        createdAt: new Date().toISOString(),
      });
    }

    const response: PlinkoDropResponse = {
      betId: result.betId,
      wager,
      rows,
      risk,
      directions: result.directions,
      bucketIndex: result.bucketIndex,
      multiplier: result.multiplier,
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
    console.error('Plinko drop error:', err);
    res.status(500).json({ error: 'Erreur lors du lancer Plinko.' });
  }
});
