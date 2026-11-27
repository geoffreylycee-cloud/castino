import { Router } from 'express';
import { z } from 'zod';
import {
  ECONOMY,
  KENO_PAYOUTS,
  drawKenoNumbers,
  type KenoPlayResponse,
  type KenoRisk,
} from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { ensureActiveSeed } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

const kenoSchema = z.object({
  wager: z.number().int().min(ECONOMY.MIN_WAGER).max(ECONOMY.MAX_WAGER),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  selectedNumbers: z
    .array(z.number().int().min(1).max(40))
    .min(1)
    .max(10),
});

export const kenoRouter = Router();

kenoRouter.post('/play', requireAuth, async (req, res) => {
  try {
    const parsed = kenoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Sélectionnez entre 1 et 10 numéros (1 à 40).' });
      return;
    }

    const userId = req.user!.userId;
    const wager = parsed.data.wager;
    const risk = parsed.data.risk as KenoRisk;
    const selectedNumbers = Array.from(new Set(parsed.data.selectedNumbers)).sort((a, b) => a - b);

    const result = await prisma.$transaction(async (tx) => {
      const [user, seed] = await Promise.all([
        tx.user.findUnique({ where: { id: userId } }),
        ensureActiveSeed(tx, userId),
      ]);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

      const nonceUsed = seed.nonce;
      const drawnNumbers = drawKenoNumbers(
        seed.serverSeed,
        seed.clientSeed,
        nonceUsed
      );
      const drawnSet = new Set(drawnNumbers);
      const hits = selectedNumbers.filter((n) => drawnSet.has(n));

      const payoutTable = KENO_PAYOUTS[risk][selectedNumbers.length];
      const multiplier = payoutTable[hits.length] ?? 0;
      const payout = Math.round(wager * multiplier);
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
            gameType: 'KENO',
            status: multiplier >= 1 ? 'WON' : 'LOST',
            wager,
            multiplier,
            payout,
            profit,
            fairnessSeedId: seed.id,
            nonceUsed,
            gameData: JSON.stringify({ risk, selectedNumbers, drawnNumbers, hits }),
          },
        }),
      ]);

      return {
        betId: bet.id,
        username: user.username,
        drawnNumbers,
        hits,
        multiplier,
        payout,
        profit,
        nonceUsed,
        newBalance: updatedUser.balance,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'KENO');

    if (result.multiplier >= 4 && result.payout >= 1000) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'KENO',
        title: 'Keno Originals',
        subtitle: `${result.hits.length}/${selectedNumbers.length} bons (${result.multiplier}×)`,
        amount: result.payout,
        multiplier: result.multiplier,
        createdAt: new Date().toISOString(),
      });
    }

    const response: KenoPlayResponse = {
      betId: result.betId,
      wager,
      risk,
      selectedNumbers,
      drawnNumbers: result.drawnNumbers,
      hits: result.hits,
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
    console.error('Keno error:', err);
    res.status(500).json({ error: 'Erreur Keno.' });
  }
});
