import { Router } from 'express';
import { z } from 'zod';
import {
  ECONOMY,
  drawBlackjackCard,
  evaluateBlackjackHand,
  type BlackjackOutcome,
  type BlackjackStateDTO,
  type PlayingCard,
} from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { consumeFairnessNonce } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

interface StoredBlackjackGame {
  playerCards: PlayingCard[];
  dealerCards: PlayingCard[];
  cursor: number;
  serverSeed: string;
  clientSeed: string;
  nonceUsed: number;
  doubled: boolean;
  outcome: BlackjackOutcome;
}

const dealSchema = z.object({
  wager: z.number().int().min(ECONOMY.MIN_WAGER).max(ECONOMY.MAX_WAGER),
});

const actionSchema = z.object({
  action: z.enum(['HIT', 'STAND', 'DOUBLE']),
});

function toPublicBlackjackDTO(
  betId: string,
  wager: number,
  state: StoredBlackjackGame,
  userBalance?: number
): BlackjackStateDTO {
  const isPlaying = state.outcome === 'PLAYING';
  const visibleDealerCards = isPlaying ? [state.dealerCards[0]] : state.dealerCards;
  const playerEval = evaluateBlackjackHand(state.playerCards);
  const dealerEval = evaluateBlackjackHand(visibleDealerCards);

  let multiplier = 0;
  if (state.outcome === 'BLACKJACK') multiplier = 2.5;
  else if (state.outcome === 'WIN') multiplier = 2;
  else if (state.outcome === 'PUSH') multiplier = 1;

  return {
    betId,
    wager,
    playerCards: state.playerCards,
    dealerCards: visibleDealerCards,
    dealerHiddenCount: isPlaying ? 1 : 0,
    playerEval: {
      total: playerEval.total,
      display: playerEval.display,
      isBlackjack: playerEval.isBlackjack,
      isBust: playerEval.isBust,
    },
    dealerEval: {
      total: dealerEval.total,
      display: dealerEval.display,
      isBlackjack: !isPlaying && dealerEval.isBlackjack,
      isBust: dealerEval.isBust,
    },
    canDouble:
      isPlaying &&
      state.playerCards.length === 2 &&
      !state.doubled &&
      (userBalance === undefined || userBalance >= wager),
    outcome: state.outcome,
    multiplier,
    payout: Math.round(wager * multiplier),
    newBalance: userBalance,
  };
}

function runDealerAndResolve(state: StoredBlackjackGame): {
  outcome: Exclude<BlackjackOutcome, 'PLAYING'>;
  multiplier: number;
} {
  let dealerEval = evaluateBlackjackHand(state.dealerCards);
  while (dealerEval.total < 17) {
    const nextCard = drawBlackjackCard(
      state.serverSeed,
      state.clientSeed,
      state.nonceUsed,
      state.cursor
    );
    state.cursor += 1;
    state.dealerCards.push(nextCard);
    dealerEval = evaluateBlackjackHand(state.dealerCards);
  }

  const playerEval = evaluateBlackjackHand(state.playerCards);

  if (playerEval.isBust) {
    state.outcome = 'LOSE';
    return { outcome: 'LOSE', multiplier: 0 };
  }
  if (dealerEval.isBust || playerEval.total > dealerEval.total) {
    state.outcome = 'WIN';
    return { outcome: 'WIN', multiplier: 2 };
  }
  if (playerEval.total === dealerEval.total) {
    state.outcome = 'PUSH';
    return { outcome: 'PUSH', multiplier: 1 };
  }
  state.outcome = 'LOSE';
  return { outcome: 'LOSE', multiplier: 0 };
}

export const blackjackRouter = Router();

blackjackRouter.get('/active', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const [active, user] = await Promise.all([
      prisma.betHistory.findFirst({
        where: { userId, gameType: 'BLACKJACK', status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);

    if (!active || !user) {
      res.json({ game: null });
      return;
    }

    const stored = JSON.parse(active.gameData) as StoredBlackjackGame;
    res.json({ game: toPublicBlackjackDTO(active.id, active.wager, stored, user.balance) });
  } catch (err) {
    console.error('Blackjack active error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

blackjackRouter.post('/deal', requireAuth, async (req, res) => {
  try {
    const parsed = dealSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Mise invalide.' });
      return;
    }

    const userId = req.user!.userId;
    const { wager } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.betHistory.findFirst({
        where: { userId, gameType: 'BLACKJACK', status: 'ACTIVE' },
      });
      if (existing) throw new Error('GAME_ALREADY_ACTIVE');

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

      const fairness = await consumeFairnessNonce(tx, userId);
      const p1 = drawBlackjackCard(fairness.serverSeed, fairness.clientSeed, fairness.nonceUsed, 0);
      const d1 = drawBlackjackCard(fairness.serverSeed, fairness.clientSeed, fairness.nonceUsed, 1);
      const p2 = drawBlackjackCard(fairness.serverSeed, fairness.clientSeed, fairness.nonceUsed, 2);
      const d2 = drawBlackjackCard(fairness.serverSeed, fairness.clientSeed, fairness.nonceUsed, 3);

      const playerCards = [p1, p2];
      const dealerCards = [d1, d2];
      const pEval = evaluateBlackjackHand(playerCards);
      const dEval = evaluateBlackjackHand(dealerCards);

      let outcome: BlackjackOutcome = 'PLAYING';
      let multiplier = 0;

      if (pEval.isBlackjack && dEval.isBlackjack) {
        outcome = 'PUSH';
        multiplier = 1;
      } else if (pEval.isBlackjack) {
        outcome = 'BLACKJACK';
        multiplier = 2.5;
      } else if (dEval.isBlackjack) {
        outcome = 'LOSE';
        multiplier = 0;
      }

      const state: StoredBlackjackGame = {
        playerCards,
        dealerCards,
        cursor: 4,
        serverSeed: fairness.serverSeed,
        clientSeed: fairness.clientSeed,
        nonceUsed: fairness.nonceUsed,
        doubled: false,
        outcome,
      };

      const isFinished = outcome !== 'PLAYING';
      const payout = isFinished ? Math.round(wager * multiplier) : 0;
      const balanceDelta = isFinished ? payout - wager : -wager;

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { increment: balanceDelta },
          totalWagered: { increment: wager },
          totalWon: { increment: payout },
        },
      });

      const bet = await tx.betHistory.create({
        data: {
          userId,
          gameType: 'BLACKJACK',
          status: !isFinished ? 'ACTIVE' : multiplier >= 1 ? 'WON' : 'LOST',
          wager,
          multiplier: isFinished ? multiplier : 0,
          payout,
          profit: isFinished ? payout - wager : -wager,
          fairnessSeedId: fairness.seedId,
          nonceUsed: fairness.nonceUsed,
          gameData: JSON.stringify(state),
        },
      });

      return {
        betId: bet.id,
        state,
        newBalance: updatedUser.balance,
        username: updatedUser.username,
        payout,
        multiplier,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'BLACKJACK_DEAL');

    if (result.state.outcome === 'BLACKJACK' && result.payout >= 1000) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'BLACKJACK',
        title: 'Blackjack Originals',
        subtitle: 'Blackjack Naturel 2.50x ♠',
        amount: result.payout,
        multiplier: 2.5,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      game: toPublicBlackjackDTO(result.betId, wager, result.state, result.newBalance),
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ error: 'Solde insuffisant.' });
        return;
      }
      if (err.message === 'GAME_ALREADY_ACTIVE') {
        res.status(400).json({ error: 'Une main de Blackjack est déjà en cours.' });
        return;
      }
    }
    console.error('Blackjack deal error:', err);
    res.status(500).json({ error: 'Erreur lors de la distribution.' });
  }
});

blackjackRouter.post('/action', requireAuth, async (req, res) => {
  try {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Action invalide.' });
      return;
    }

    const userId = req.user!.userId;
    const { action } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const bet = await tx.betHistory.findFirst({
        where: { userId, gameType: 'BLACKJACK', status: 'ACTIVE' },
      });
      if (!bet) throw new Error('NO_ACTIVE_GAME');

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const state = JSON.parse(bet.gameData) as StoredBlackjackGame;
      let totalWager = bet.wager;
      let extraWagerDeducted = 0;

      if (action === 'DOUBLE') {
        if (state.playerCards.length !== 2 || state.doubled) {
          throw new Error('CANNOT_DOUBLE');
        }
        if (user.balance < bet.wager) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
        extraWagerDeducted = bet.wager;
        totalWager = bet.wager * 2;
        state.doubled = true;

        const card = drawBlackjackCard(
          state.serverSeed,
          state.clientSeed,
          state.nonceUsed,
          state.cursor
        );
        state.cursor += 1;
        state.playerCards.push(card);

        const pEval = evaluateBlackjackHand(state.playerCards);
        if (pEval.isBust) {
          state.outcome = 'LOSE';
        } else {
          runDealerAndResolve(state);
        }
      } else if (action === 'HIT') {
        const card = drawBlackjackCard(
          state.serverSeed,
          state.clientSeed,
          state.nonceUsed,
          state.cursor
        );
        state.cursor += 1;
        state.playerCards.push(card);

        const pEval = evaluateBlackjackHand(state.playerCards);
        if (pEval.isBust) {
          state.outcome = 'LOSE';
        } else if (pEval.total === 21) {
          runDealerAndResolve(state);
        }
      } else if (action === 'STAND') {
        runDealerAndResolve(state);
      }

      const isFinished = state.outcome !== 'PLAYING';
      let multiplier = 0;
      if (state.outcome === 'WIN') multiplier = 2;
      else if (state.outcome === 'PUSH') multiplier = 1;
      else if (state.outcome === 'BLACKJACK') multiplier = 2.5;

      const payout = isFinished ? Math.round(totalWager * multiplier) : 0;
      const balanceChange = payout - extraWagerDeducted;

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { increment: balanceChange },
          totalWagered: { increment: extraWagerDeducted },
          totalWon: { increment: payout },
        },
      });

      // Si le jeu continue, retirer les champs sensibles dans la réponse via DTO mais les garder en DB
      await tx.betHistory.update({
        where: { id: bet.id },
        data: {
          wager: totalWager,
          status: !isFinished ? 'ACTIVE' : multiplier >= 1 ? 'WON' : 'LOST',
          multiplier: isFinished ? multiplier : 0,
          payout,
          profit: isFinished ? payout - totalWager : -totalWager,
          gameData: JSON.stringify(state),
        },
      });

      return {
        betId: bet.id,
        totalWager,
        state,
        newBalance: updatedUser.balance,
        username: updatedUser.username,
        payout,
        multiplier,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'BLACKJACK_ACTION');

    if (result.state.outcome === 'WIN' && result.payout >= 1500) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASINO_WIN',
        username: result.username,
        isBot: false,
        gameType: 'BLACKJACK',
        title: 'Blackjack Originals',
        subtitle: `${result.state.doubled ? 'Double Down ' : ''}2.00x`,
        amount: result.payout,
        multiplier: result.multiplier,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      game: toPublicBlackjackDTO(result.betId, result.totalWager, result.state, result.newBalance),
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'NO_ACTIVE_GAME') {
        res.status(400).json({ error: 'Aucune main active.' });
        return;
      }
      if (err.message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ error: 'Solde insuffisant pour doubler.' });
        return;
      }
      if (err.message === 'CANNOT_DOUBLE') {
        res.status(400).json({ error: 'Action Doubler non autorisée.' });
        return;
      }
    }
    console.error('Blackjack action error:', err);
    res.status(500).json({ error: 'Erreur lors du coup Blackjack.' });
  }
});
