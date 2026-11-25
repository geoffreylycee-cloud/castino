import { Router } from 'express';
import type { BetHistoryDTO, BetStatus, GameType, LeaderboardEntryDTO } from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { optionalAuth } from '../../middlewares/auth.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', optionalAuth, async (req, res) => {
  try {
    const [topByBalance, topByWager, recentGlobalBets, myBets] = await Promise.all([
      prisma.user.findMany({
        orderBy: { balance: 'desc' },
        take: 20,
      }),
      prisma.user.findMany({
        orderBy: { totalWagered: 'desc' },
        take: 20,
      }),
      prisma.betHistory.findMany({
        where: { status: { in: ['WON', 'LOST'] } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { user: { select: { username: true } } },
      }),
      req.user
        ? prisma.betHistory.findMany({
            where: { userId: req.user.userId, status: { in: ['WON', 'LOST'] } },
            orderBy: { createdAt: 'desc' },
            take: 25,
            include: { user: { select: { username: true } } },
          })
        : Promise.resolve([]),
    ]);

    const mapLeaderboard = (rows: typeof topByBalance): LeaderboardEntryDTO[] =>
      rows.map((u, idx) => ({
        rank: idx + 1,
        id: u.id,
        username: u.username,
        avatarSeed: u.avatarSeed,
        balance: u.balance,
        totalWagered: u.totalWagered,
        totalWon: u.totalWon,
      }));

    const mapBets = (rows: typeof recentGlobalBets): BetHistoryDTO[] =>
      rows.map((b) => ({
        id: b.id,
        username: b.user.username,
        gameType: b.gameType as GameType,
        status: b.status as BetStatus,
        wager: b.wager,
        multiplier: b.multiplier,
        payout: b.payout,
        profit: b.profit,
        nonceUsed: b.nonceUsed,
        createdAt: b.createdAt.toISOString(),
      }));

    res.json({
      byBalance: mapLeaderboard(topByBalance),
      byWagered: mapLeaderboard(topByWager),
      recentBets: mapBets(recentGlobalBets),
      myBets: mapBets(myBets),
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement du classement.' });
  }
});
