import { Router } from 'express';
import { z } from 'zod';
import {
  ECONOMY,
  calculateMinesMultiplier,
  generateMinePositions,
  type MinesActiveGameDTO,
} from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { consumeFairnessNonce } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

interface MinesStoredData {
  minesCount: number;
  minePositions: number[];
  revealedTiles: number[];
}

const startMinesSchema = z.object({
  wager: z.number().int().min(ECONOMY.MIN_WAGER).max(ECONOMY.MAX_WAGER),
  minesCount: z.number().int().min(1).max(24),
});

const revealTileSchema = z.object({
  tileIndex: z.number().int().min(0).max(24),
});

function toMinesDTO(
  betId: string,
  wager: number,
  status: 'ACTIVE' | 'WON' | 'LOST',
  data: MinesStoredData,
  hitMineIndex?: number
): MinesActiveGameDTO {
  const safeCount = data.revealedTiles.length;
  const maxSafe = 25 - data.minesCount;
  const currentMultiplier =
    status === 'LOST' ? 0 : safeCount === 0 ? 1 : calculateMinesMultiplier(data.minesCount, safeCount);
  const nextMultiplier =
    safeCount < maxSafe ? calculateMinesMultiplier(data.minesCount, safeCount + 1) : currentMultiplier;
  const currentPayout = status === 'LOST' ? 0 : Math.round(wager * currentMultiplier);

  return {
    betId,
    wager,
    minesCount: data.minesCount,
    revealedTiles: data.revealedTiles,
    currentMultiplier,
    nextMultiplier,
    currentPayout,
    status,
    minePositions: status !== 'ACTIVE' ? data.minePositions : undefined,
    hitMineIndex,
  };
}

export const minesRouter = Router();

minesRouter.get('/active', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const active = await prisma.betHistory.findFirst({
      where: { userId, gameType: 'MINES', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!active) {
      res.json({ game: null });
      return;
    }

    const data = JSON.parse(active.gameData) as MinesStoredData;
    res.json({ game: toMinesDTO(active.id, active.wager, 'ACTIVE', data) });
  } catch (err) {
    console.error('Mines active error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

minesRouter.post('/start', requireAuth, async (req, res) => {
  try {
    const parsed = startMinesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Paramètres Mines invalides.' });
      return;
    }

    const userId = req.user!.userId;
    const { wager, minesCount } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.betHistory.findFirst({
        where: { userId, gameType: 'MINES', status: 'ACTIVE' },
      });
      if (existing) throw new Error('GAME_ALREADY_ACTIVE');

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

      const fairness = await consumeFairnessNonce(tx, userId);
      const minePositions = generateMinePositions(
        fairness.serverSeed,
        fairness.clientSeed,
        fairness.nonceUsed,
        minesCount
      );

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: wager },
          totalWagered: { increment: wager },
        },
      });

      const stored: MinesStoredData = {
        minesCount,
        minePositions,
        revealedTiles: [],
      };

      const bet = await tx.betHistory.create({
        data: {
          userId,
          gameType: 'MINES',
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

    emitBalanceUpdate(userId, result.newBalance, 'MINES_START');
    res.json({
      game: toMinesDTO(result.betId, wager, 'ACTIVE', result.stored),
      newBalance: result.newBalance,
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ error: 'Solde insuffisant.' });
        return;
      }
      if (err.message === 'GAME_ALREADY_ACTIVE') {
        res.status(400).json({ error: 'Une partie de Mines est déjà en cours.' });
        return;
      }
    }
    console.error('Mines start error:', err);
    res.status(500).json({ error: 'Erreur au lancement de Mines.' });
  }
});

minesRouter.post('/reveal', requireAuth, async (req, res) => {
  try {
    const parsed = revealTileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Tuile invalide.' });
      return;
    }

    const userId = req.user!.userId;
    const { tileIndex } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const bet = await tx.betHistory.findFirst({
        where: { userId, gameType: 'MINES', status: 'ACTIVE' },
      });
      if (!bet) throw new Error('NO_ACTIVE_GAME');

      const data = JSON.parse(bet.gameData) as MinesStoredData;
      if (data.revealedTiles.includes(tileIndex)) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return {
          status: 'ACTIVE' as const,
          wager: bet.wager,
          betId: bet.id,
          data,
          newBalance: user.balance,
          username: user.username,
          payout: 0,
          multiplier: 1,
        };
      }

      // Bombe touchée !
      if (data.minePositions.includes(tileIndex)) {
        await tx.betHistory.update({
          where: { id: bet.id },
          data: {
            status: 'LOST',
            multiplier: 0,
            payout: 0,
            profit: -bet.wager,
            gameData: JSON.stringify(data),
          },
        });
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return {
          status: 'LOST' as const,
          wager: bet.wager,
          betId: bet.id,
          data,
          hitMineIndex: tileIndex,
          newBalance: user.balance,
          username: user.username,
          payout: 0,
          multiplier: 0,
        };
      }

      // Diamant trouvé !
      data.revealedTiles.push(tileIndex);
      const maxSafe = 25 - data.minesCount;
      const multiplier = calculateMinesMultiplier(data.minesCount, data.revealedTiles.length);

      // Si tous les diamants ont été trouvés, victoire automatique !
      if (data.revealedTiles.length >= maxSafe) {
        const payout = Math.round(bet.wager * multiplier);
        const profit = payout - bet.wager;

        await tx.betHistory.update({
          where: { id: bet.id },
          data: {
            status: 'WON',
            multiplier,
            payout,
            profit,
            gameData: JSON.stringify(data),
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
          status: 'WON' as const,
          wager: bet.wager,
          betId: bet.id,
          data,
          newBalance: updatedUser.balance,
          username: updatedUser.username,
          payout,
          multiplier,
        };
      }

      await tx.betHistory.update({
        where: { id: bet.id },
        data: {
          multiplier,
          gameData: JSON.stringify(data),
        },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

      return {
        status: 'ACTIVE' as const,
        wager: bet.wager,
        betId: bet.id,
        data,
        newBalance: user.balance,
        username: user.username,
        payout: 0,
        multiplier,
      };
    });

    if (result.status === 'WON') {
      emitBalanceUpdate(userId, result.newBalance, 'MINES_WIN');
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'MINES',
        title: 'Mines Originals',
        subtitle: ` Grille complète ! ${result.multiplier.toFixed(2)}x`,
        amount: result.payout,
        multiplier: result.multiplier,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      game: toMinesDTO(
        result.betId,
        result.wager,
        result.status,
        result.data,
        'hitMineIndex' in result ? result.hitMineIndex : undefined
      ),
      newBalance: result.newBalance,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NO_ACTIVE_GAME') {
      res.status(400).json({ error: 'Aucune partie de Mines en cours.' });
      return;
    }
    console.error('Mines reveal error:', err);
    res.status(500).json({ error: 'Erreur lors de la révélation.' });
  }
});

minesRouter.post('/cashout', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
      const bet = await tx.betHistory.findFirst({
        where: { userId, gameType: 'MINES', status: 'ACTIVE' },
      });
      if (!bet) throw new Error('NO_ACTIVE_GAME');

      const data = JSON.parse(bet.gameData) as MinesStoredData;
      if (data.revealedTiles.length === 0) {
        throw new Error('NO_TILES_REVEALED');
      }

      const multiplier = calculateMinesMultiplier(data.minesCount, data.revealedTiles.length);
      const payout = Math.round(bet.wager * multiplier);
      const profit = payout - bet.wager;

      await tx.betHistory.update({
        where: { id: bet.id },
        data: {
          status: 'WON',
          multiplier,
          payout,
          profit,
          gameData: JSON.stringify(data),
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
        data,
        multiplier,
        payout,
        newBalance: updatedUser.balance,
        username: updatedUser.username,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'MINES_CASHOUT');

    if (result.multiplier >= 1.8 && result.payout >= 800) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'MINES',
        title: 'Mines Originals',
        subtitle: `${result.multiplier.toFixed(2)}x (${result.data.minesCount} mines)`,
        amount: result.payout,
        multiplier: result.multiplier,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      game: toMinesDTO(result.betId, result.wager, 'WON', result.data),
      newBalance: result.newBalance,
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NO_ACTIVE_GAME') {
        res.status(400).json({ error: 'Aucune partie active à encaisser.' });
        return;
      }
      if (err.message === 'NO_TILES_REVEALED') {
        res.status(400).json({ error: 'Révélez au moins un diamant avant de faire Cashout.' });
        return;
      }
    }
    console.error('Mines cashout error:', err);
    res.status(500).json({ error: 'Erreur lors du Cashout Mines.' });
  }
});
