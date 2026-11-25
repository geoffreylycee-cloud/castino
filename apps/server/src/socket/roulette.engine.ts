import crypto from 'node:crypto';
import {
  ECONOMY,
  getRouletteColor,
  rollRouletteNumber,
  sha256Hex,
  type LiveRouletteBetDTO,
  type LiveRouletteSnapshotDTO,
  type LiveRouletteStatus,
  type RouletteBetKind,
} from '@castino/shared';
import { prisma } from '../lib/prisma.js';
import { broadcastFeedEvent, emitBalanceUpdate, getSocketServer } from './hub.js';

const BETTING_MS = 12000;
const SPINNING_MS = 4500;
const RESULT_MS = 3200;

function evaluateRouletteBet(
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

class RouletteEngine {
  private roundNumber = 1;
  private status: LiveRouletteStatus = 'BETTING';
  private serverSeed = '';
  private serverSeedHash = '';
  private publicSeed = '';
  private winningNumber = 0;
  private winningColor: 'GREEN' | 'RED' | 'BLACK' = 'GREEN';
  private bettingEndsAt = 0;
  private spinStartedAt = 0;
  private bets: LiveRouletteBetDTO[] = [];
  private history: {
    roundNumber: number;
    winningNumber: number;
    winningColor: 'GREEN' | 'RED' | 'BLACK';
  }[] = [];

  init(): void {
    this.startBettingPhase();
  }

  getSnapshot(): LiveRouletteSnapshotDTO {
    return {
      roundNumber: this.roundNumber,
      status: this.status,
      serverSeedHash: this.serverSeedHash,
      serverSeed: this.status === 'RESULT' ? this.serverSeed : undefined,
      publicSeed: this.publicSeed,
      bettingEndsAt: this.status === 'BETTING' ? this.bettingEndsAt : undefined,
      spinStartedAt: this.status !== 'BETTING' ? this.spinStartedAt : undefined,
      serverNow: Date.now(),
      winningNumber: this.status !== 'BETTING' ? this.winningNumber : undefined,
      winningColor: this.status !== 'BETTING' ? this.winningColor : undefined,
      bets: this.bets,
      history: this.history,
    };
  }

  private broadcastSnapshot(): void {
    getSocketServer()?.emit('roulette:snapshot', this.getSnapshot());
  }

  private startBettingPhase(): void {
    this.status = 'BETTING';
    this.bets = [];
    this.serverSeed = crypto.randomBytes(32).toString('hex');
    this.serverSeedHash = sha256Hex(this.serverSeed);
    this.publicSeed = `castino-roulette-${this.roundNumber}-${Date.now().toString(36)}`;
    this.winningNumber = rollRouletteNumber(this.serverSeed, this.publicSeed, 0);
    this.winningColor = getRouletteColor(this.winningNumber);
    this.bettingEndsAt = Date.now() + BETTING_MS;

    this.broadcastSnapshot();

    setTimeout(() => {
      this.startSpinningPhase();
    }, BETTING_MS);
  }

  private startSpinningPhase(): void {
    this.status = 'SPINNING';
    this.spinStartedAt = Date.now();
    this.broadcastSnapshot();

    setTimeout(() => {
      void this.finishResultPhase();
    }, SPINNING_MS);
  }

  private async finishResultPhase(): Promise<void> {
    this.status = 'RESULT';

    // Régler toutes les mises de la manche en base
    const userPayouts = new Map<string, { totalPayout: number; username: string; bestMult: number; betId: string }>();

    for (const bet of this.bets) {
      const evalRes = evaluateRouletteBet(bet.betKind, bet.betNumber, this.winningNumber);
      const payout = evalRes.won ? Math.round(bet.wager * evalRes.multiplier) : 0;
      const profit = payout - bet.wager;

      bet.won = evalRes.won;
      bet.multiplier = evalRes.won ? evalRes.multiplier : 0;
      bet.payout = payout;

      try {
        await prisma.betHistory.update({
          where: { id: bet.betId },
          data: {
            status: evalRes.won ? 'WON' : 'LOST',
            multiplier: evalRes.won ? evalRes.multiplier : 0,
            payout,
            profit,
            gameData: JSON.stringify({
              roundNumber: this.roundNumber,
              betKind: bet.betKind,
              betNumber: bet.betNumber,
              winningNumber: this.winningNumber,
              winningColor: this.winningColor,
            }),
          },
        });

        if (evalRes.won && payout > 0) {
          const prev = userPayouts.get(bet.userId);
          userPayouts.set(bet.userId, {
            totalPayout: (prev?.totalPayout || 0) + payout,
            username: bet.username,
            bestMult: Math.max(prev?.bestMult || 0, evalRes.multiplier),
            betId: bet.betId,
          });
        }
      } catch (err) {
        console.error('Roulette bet settle error:', err);
      }
    }

    for (const [userId, info] of userPayouts.entries()) {
      try {
        const updated = await prisma.user.update({
          where: { id: userId },
          data: {
            balance: { increment: info.totalPayout },
            totalWon: { increment: info.totalPayout },
          },
        });
        emitBalanceUpdate(userId, updated.balance, 'ROULETTE_WIN');

        if (info.bestMult >= 2 && info.totalPayout >= 1000) {
          broadcastFeedEvent({
            id: info.betId,
            type: 'CASINO_WIN',
            username: info.username,
            isBot: false,
            gameType: 'ROULETTE',
            title: 'Roulette Live',
            subtitle: `Numéro ${this.winningNumber} (${info.bestMult}×)`,
            amount: info.totalPayout,
            multiplier: info.bestMult,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Roulette user credit error:', err);
      }
    }

    this.history.unshift({
      roundNumber: this.roundNumber,
      winningNumber: this.winningNumber,
      winningColor: this.winningColor,
    });
    if (this.history.length > 20) this.history.pop();

    this.broadcastSnapshot();

    this.roundNumber += 1;
    setTimeout(() => {
      this.startBettingPhase();
    }, RESULT_MS);
  }

  async placeBet(
    userId: string,
    payload: { wager: number; betKind: RouletteBetKind; betNumber?: number }
  ): Promise<{ ok: boolean; error?: string; newBalance?: number }> {
    if (this.status !== 'BETTING') {
      return { ok: false, error: 'Les mises sont fermées pendant que la roue tourne !' };
    }
    const { wager, betKind, betNumber } = payload;
    if (!Number.isInteger(wager) || wager < ECONOMY.MIN_WAGER || wager > ECONOMY.MAX_WAGER) {
      return { ok: false, error: 'Montant de mise invalide.' };
    }
    if (betKind === 'NUMBER' && (betNumber === undefined || betNumber < 0 || betNumber > 36)) {
      return { ok: false, error: 'Numéro invalide (0 à 36).' };
    }

    const myBetsCount = this.bets.filter((b) => b.userId === userId).length;
    if (myBetsCount >= 6) {
      return { ok: false, error: 'Maximum 6 mises par manche de Roulette.' };
    }

    try {
      const txRes = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('USER_NOT_FOUND');
        if (user.balance < wager) throw new Error('INSUFFICIENT_BALANCE');

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            balance: { decrement: wager },
            totalWagered: { increment: wager },
          },
        });

        const bet = await tx.betHistory.create({
          data: {
            userId,
            gameType: 'ROULETTE',
            status: 'ACTIVE',
            wager,
            multiplier: 0,
            payout: 0,
            profit: -wager,
            gameData: JSON.stringify({
              roundNumber: this.roundNumber,
              betKind,
              betNumber,
            }),
          },
        });

        return { betId: bet.id, username: user.username, newBalance: updatedUser.balance };
      });

      const liveBet: LiveRouletteBetDTO = {
        betId: txRes.betId,
        userId,
        username: txRes.username,
        wager,
        betKind,
        betNumber,
      };

      this.bets.push(liveBet);
      emitBalanceUpdate(userId, txRes.newBalance, 'ROULETTE_BET');
      getSocketServer()?.emit('roulette:player_bet', liveBet);

      return { ok: true, newBalance: txRes.newBalance };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
        return { ok: false, error: 'Solde insuffisant.' };
      }
      console.error('Roulette placeBet error:', err);
      return { ok: false, error: 'Erreur lors de la prise de mise.' };
    }
  }
}

export const rouletteEngine = new RouletteEngine();
