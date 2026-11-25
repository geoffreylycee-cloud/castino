import { Router } from 'express';
import { z } from 'zod';
import {
  ECONOMY,
  getRouletteColor,
  rollRouletteNumber,
  type RouletteBetKind,
  type RouletteSpinResponse,
} from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { consumeFairnessNonce } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

const rouletteSchema = z.object({
  wager: z.number().int().min(ECONOMY.MIN_WAGER).max(ECONOMY.MAX_WAGER),
  betKind: z.enum([
    'RED',
    'BLACK',
    'GREEN',
    'EVEN',
    'ODD',
    'LOW',
    'HIGH',
    'DOZEN_1',
    'DOZEN_2',
    'DOZEN_3',
    'NUMBER',
  ]),
  betNumber: z.number().int().min(0).max(36).optional(),
});

function evaluateRoulette(
  betKind: RouletteBetKind,
  betNumber: number | undefined,
  winningNumber: number
): { won: boolean; multiplier: number } {
  const color = getRouletteColor(winningNumber);

  switch (betKind) {
    case 'GREEN':
      return { won: winningNumber === 0, multiplier: 36 };
    case 'NUMBER':
      return { won: winningNumber === betNumber, multiplier: 36 };
    case 'RED':
      return { won: color === 'RED', multiplier: 2 };
    case 'BLACK':
      return { won: color === 'BLACK', multiplier: 2 };
    case 'EVEN':
      return { won: winningNumber !== 0 && winningNumber % 2 === 0, multiplier: 2 };
    case 'ODD':
      return { won: winningNumber !== 0 && winningNumber % 2 === 1, multiplier: 2 };
    case 'LOW':
      return { won: winningNumber >= 1 && winningNumber <= 18, multiplier: 2 };
    case 'HIGH':
      return { won: winningNumber >= 19 && winningNumber <= 36, multiplier: 2 };
    case 'DOZEN_1':
      return { won: winningNumber >= 1 && winningNumber <= 12, multiplier: 3 };
    case 'DOZEN_2':
      return { won: winningNumber >= 13 && winningNumber <= 24, multiplier: 3 };
    case 'DOZEN_3':
      return { won: winningNumber >= 25 && winningNumber <= 36, multiplier: 3 };
  }
}

export const rouletteRouter = Router();

rouletteRouter.post('/spin', requireAuth, async (req, res) => {
  try {
    const parsed = rouletteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Mise Roulette invalide.' });
      return;
    }

    const userId = req.user!.userId;
    const { wager, betKind, betNumber } = parsed.data;
    if (betKind === 'NUMBER' && betNumber === undefined) {
      res.status(400).json({ error: 'Choisissez un numéro entre 0 et 36.' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

      const fairness = await consumeFairnessNonce(tx, userId);
      const winningNumber = rollRouletteNumber(
        fairness.serverSeed,
        fairness.clientSeed,
        fairness.nonceUsed
      );
      const winningColor = getRouletteColor(winningNumber);
      const evalRes = evaluateRoulette(betKind, betNumber, winningNumber);

      const payout = evalRes.won ? Math.round(wager * evalRes.multiplier) : 0;
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
          gameType: 'ROULETTE',
          status: evalRes.won ? 'WON' : 'LOST',
          wager,
          multiplier: evalRes.won ? evalRes.multiplier : 0,
          payout,
          profit,
          fairnessSeedId: fairness.seedId,
          nonceUsed: fairness.nonceUsed,
          gameData: JSON.stringify({ betKind, betNumber, winningNumber, winningColor }),
        },
      });

      return {
        betId: bet.id,
        username: user.username,
        winningNumber,
        winningColor,
        won: evalRes.won,
        multiplier: evalRes.won ? evalRes.multiplier : 0,
        payout,
        profit,
        nonceUsed: fairness.nonceUsed,
        newBalance: updatedUser.balance,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'ROULETTE');

    if (result.won && result.multiplier >= 3 && result.payout >= 1000) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'ROULETTE',
        title: 'Roulette Européenne',
        subtitle: `Numéro ${result.winningNumber} (${result.multiplier}×)`,
        amount: result.payout,
        multiplier: result.multiplier,
        createdAt: new Date().toISOString(),
      });
    }

    const response: RouletteSpinResponse = {
      betId: result.betId,
      wager,
      betKind,
      betNumber,
      winningNumber: result.winningNumber,
      winningColor: result.winningColor,
      won: result.won,
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
    console.error('Roulette error:', err);
    res.status(500).json({ error: 'Erreur Roulette.' });
  }
});
