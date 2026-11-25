import crypto from 'node:crypto';
import {
  ECONOMY,
  calculateCrashPoint,
  crashDurationForMultiplierMs,
  crashMultiplierAtElapsedMs,
  sha256Hex,
  type CrashPlayerBetDTO,
  type CrashSnapshotDTO,
  type CrashStatus,
} from '@castino/shared';
import { prisma } from '../lib/prisma.js';
import { broadcastFeedEvent, emitBalanceUpdate, getSocketServer } from './hub.js';

interface ActiveCrashBet extends CrashPlayerBetDTO {
  settled: boolean;
}

const WAITING_MS = 6000;
const CRASHED_PAUSE_MS = 4000;

class CrashEngine {
  private roundId = '';
  private roundNumber = 1;
  private status: CrashStatus = 'WAITING';
  private serverSeed = '';
  private serverSeedHash = '';
  private publicSeed = '';
  private crashPoint = 1.0;
  private waitingEndsAt = 0;
  private startedAt = 0;
  private currentMultiplier = 1.0;
  private bets = new Map<string, ActiveCrashBet>(); // key: userId (or bot id)
  private history: { roundNumber: number; crashPoint: number; serverSeedHash: string }[] = [];
  private tickTimer: NodeJS.Timeout | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private processingCashouts = new Set<string>();

  async init(): Promise<void> {
    const lastRounds = await prisma.crashRound.findMany({
      where: { status: 'CRASHED' },
      orderBy: { roundNumber: 'desc' },
      take: 15,
    });

    this.history = lastRounds.map((r) => ({
      roundNumber: r.roundNumber,
      crashPoint: r.crashPoint,
      serverSeedHash: r.serverSeedHash,
    }));

    const latest = await prisma.crashRound.findFirst({
      orderBy: { roundNumber: 'desc' },
    });
    this.roundNumber = latest ? latest.roundNumber + 1 : 1;

    await this.startWaitingPhase();
  }

  getSnapshot(): CrashSnapshotDTO {
    return {
      roundId: this.roundId,
      roundNumber: this.roundNumber,
      status: this.status,
      serverSeedHash: this.serverSeedHash,
      serverSeed: this.status === 'CRASHED' ? this.serverSeed : undefined,
      publicSeed: this.publicSeed,
      waitingEndsAt: this.status === 'WAITING' ? this.waitingEndsAt : undefined,
      startedAt: this.status !== 'WAITING' ? this.startedAt : undefined,
      serverNow: Date.now(),
      currentMultiplier: this.currentMultiplier,
      crashPoint: this.status === 'CRASHED' ? this.crashPoint : undefined,
      bets: Array.from(this.bets.values()),
      history: this.history,
    };
  }

  private broadcastSnapshot(): void {
    const io = getSocketServer();
    if (!io) return;
    io.emit('crash:snapshot', this.getSnapshot());
  }

  private async startWaitingPhase(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.phaseTimer) clearTimeout(this.phaseTimer);

    this.bets.clear();
    this.processingCashouts.clear();
    this.status = 'WAITING';
    this.currentMultiplier = 1.0;

    this.serverSeed = crypto.randomBytes(32).toString('hex');
    this.serverSeedHash = sha256Hex(this.serverSeed);
    this.publicSeed = `castino-round-${this.roundNumber}-${Date.now().toString(36)}`;
    this.crashPoint = calculateCrashPoint(this.serverSeed, this.publicSeed);
    this.waitingEndsAt = Date.now() + WAITING_MS;

    const round = await prisma.crashRound.create({
      data: {
        roundNumber: this.roundNumber,
        status: 'WAITING',
        crashPoint: this.crashPoint,
        serverSeed: this.serverSeed,
        serverSeedHash: this.serverSeedHash,
        publicSeed: this.publicSeed,
      },
    });
    this.roundId = round.id;

    this.broadcastSnapshot();

    this.phaseTimer = setTimeout(() => {
      void this.startRunningPhase();
    }, WAITING_MS);
  }

  private async startRunningPhase(): Promise<void> {
    this.status = 'RUNNING';
    this.startedAt = Date.now();
    this.currentMultiplier = 1.0;

    await prisma.crashRound.update({
      where: { id: this.roundId },
      data: { status: 'RUNNING', startedAt: new Date(this.startedAt) },
    });

    if (this.crashPoint <= 1.0) {
      await this.finishCrashPhase();
      return;
    }

    this.broadcastSnapshot();
    const maxDurationMs = crashDurationForMultiplierMs(this.crashPoint);

    this.tickTimer = setInterval(() => {
      const elapsedMs = Date.now() - this.startedAt;
      if (elapsedMs >= maxDurationMs) {
        if (this.tickTimer) clearInterval(this.tickTimer);
        void this.finishCrashPhase();
        return;
      }

      const mult = Math.min(this.crashPoint, crashMultiplierAtElapsedMs(elapsedMs));
      this.currentMultiplier = mult;

      // Vérification des Auto-Cashouts (joueurs réels et bots)
      for (const [uid, bet] of this.bets.entries()) {
        if (!bet.settled && bet.autoCashoutAt && mult >= bet.autoCashoutAt && bet.autoCashoutAt <= this.crashPoint) {
          if (bet.isBot) {
            this.settleBotCashout(bet, bet.autoCashoutAt);
          } else if (!this.processingCashouts.has(uid)) {
            void this.cashoutPlayer(uid, bet.autoCashoutAt);
          }
        }
      }

      getSocketServer()?.emit('crash:tick', {
        multiplier: this.currentMultiplier,
        elapsedMs,
        serverNow: Date.now(),
      });
    }, 75);
  }

  private settleBotCashout(bet: ActiveCrashBet, cashoutMult: number): void {
    bet.settled = true;
    bet.cashedOutAt = cashoutMult;
    bet.payout = Math.round(bet.wager * cashoutMult);
    getSocketServer()?.emit('crash:player_cashout', {
      betId: bet.betId,
      userId: bet.userId,
      username: bet.username,
      cashedOutAt: cashoutMult,
      payout: bet.payout,
    });
  }

  private async finishCrashPhase(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    this.status = 'CRASHED';
    this.currentMultiplier = this.crashPoint;

    // Clôturer les paris réels non encaissés en LOST
    const unsettledRealBetIds = Array.from(this.bets.values())
      .filter((b) => !b.isBot && !b.settled)
      .map((b) => b.betId);

    for (const b of this.bets.values()) {
      b.settled = true;
    }

    await prisma.$transaction([
      prisma.crashRound.update({
        where: { id: this.roundId },
        data: { status: 'CRASHED', crashedAt: new Date() },
      }),
      ...(unsettledRealBetIds.length > 0
        ? [
            prisma.betHistory.updateMany({
              where: { id: { in: unsettledRealBetIds }, status: 'ACTIVE' },
              data: { status: 'LOST', multiplier: 0, payout: 0 },
            }),
          ]
        : []),
    ]);

    this.history.unshift({
      roundNumber: this.roundNumber,
      crashPoint: this.crashPoint,
      serverSeedHash: this.serverSeedHash,
    });
    if (this.history.length > 15) this.history.pop();

    this.broadcastSnapshot();

    this.roundNumber += 1;
    this.phaseTimer = setTimeout(() => {
      void this.startWaitingPhase();
    }, CRASHED_PAUSE_MS);
  }

  async placeBet(
    userId: string,
    wager: number,
    autoCashoutAt?: number | null
  ): Promise<{ ok: boolean; error?: string; newBalance?: number }> {
    if (this.status !== 'WAITING') {
      return { ok: false, error: 'Les mises sont fermées pour cette manche. Attendez la suivante !' };
    }
    if (this.bets.has(userId)) {
      return { ok: false, error: 'Vous avez déjà placé une mise sur cette manche.' };
    }
    if (!Number.isInteger(wager) || wager < ECONOMY.MIN_WAGER || wager > ECONOMY.MAX_WAGER) {
      return { ok: false, error: 'Montant de mise invalide.' };
    }
    const cleanAuto =
      autoCashoutAt && autoCashoutAt >= 1.05 && autoCashoutAt <= 1000
        ? Math.round(autoCashoutAt * 100) / 100
        : null;

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
            gameType: 'CRASH',
            status: 'ACTIVE',
            wager,
            multiplier: 0,
            payout: 0,
            profit: -wager,
            crashRoundId: this.roundId,
            gameData: JSON.stringify({ autoCashoutAt: cleanAuto }),
          },
        });

        return {
          betId: bet.id,
          username: user.username,
          newBalance: updatedUser.balance,
        };
      });

      const crashBet: ActiveCrashBet = {
        betId: txRes.betId,
        userId,
        username: txRes.username,
        wager,
        autoCashoutAt: cleanAuto,
        cashedOutAt: null,
        payout: null,
        settled: false,
      };

      this.bets.set(userId, crashBet);
      emitBalanceUpdate(userId, txRes.newBalance, 'CRASH_BET');
      getSocketServer()?.emit('crash:player_bet', crashBet);

      return { ok: true, newBalance: txRes.newBalance };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
        return { ok: false, error: 'Solde insuffisant.' };
      }
      console.error('Crash placeBet error:', err);
      return { ok: false, error: 'Impossible de placer la mise.' };
    }
  }

  async cashoutPlayer(
    userId: string,
    forcedMultiplier?: number
  ): Promise<{ ok: boolean; error?: string; cashedOutAt?: number; payout?: number; newBalance?: number }> {
    if (this.status !== 'RUNNING') {
      return { ok: false, error: "La fusée n'est plus en vol." };
    }

    const bet = this.bets.get(userId);
    if (!bet || bet.isBot || bet.settled) {
      return { ok: false, error: 'Aucune mise active à encaisser.' };
    }
    if (this.processingCashouts.has(userId)) {
      return { ok: false, error: 'Encaissement en cours...' };
    }

    this.processingCashouts.add(userId);

    try {
      const elapsedMs = Date.now() - this.startedAt;
      const liveMult = crashMultiplierAtElapsedMs(elapsedMs);
      const cashedOutAt = forcedMultiplier
        ? Math.min(forcedMultiplier, this.crashPoint)
        : Math.min(liveMult, this.crashPoint);

      if (cashedOutAt >= this.crashPoint && !forcedMultiplier) {
        return { ok: false, error: 'Trop tard ! Crash imminent.' };
      }

      const finalMult = Math.max(1.01, Math.round(cashedOutAt * 100) / 100);
      const payout = Math.round(bet.wager * finalMult);
      const profit = payout - bet.wager;

      bet.settled = true;
      bet.cashedOutAt = finalMult;
      bet.payout = payout;

      const updatedUser = await prisma.$transaction(async (tx) => {
        await tx.betHistory.update({
          where: { id: bet.betId },
          data: {
            status: 'WON',
            multiplier: finalMult,
            payout,
            profit,
            gameData: JSON.stringify({
              autoCashoutAt: bet.autoCashoutAt,
              cashedOutAt: finalMult,
            }),
          },
        });

        return tx.user.update({
          where: { id: userId },
          data: {
            balance: { increment: payout },
            totalWon: { increment: payout },
          },
        });
      });

      emitBalanceUpdate(userId, updatedUser.balance, 'CRASH_CASHOUT');
      getSocketServer()?.emit('crash:player_cashout', {
        betId: bet.betId,
        userId,
        username: bet.username,
        cashedOutAt: finalMult,
        payout,
      });

      if (finalMult >= 2.0 && payout >= 800) {
        broadcastFeedEvent({
          id: bet.betId,
          type: 'CASINO_WIN',
          username: bet.username,
          isBot: false,
          gameType: 'CRASH',
          title: 'Crash Originals',
          subtitle: `Cashout à ${finalMult.toFixed(2)}x`,
          amount: payout,
          multiplier: finalMult,
          createdAt: new Date().toISOString(),
        });
      }

      return {
        ok: true,
        cashedOutAt: finalMult,
        payout,
        newBalance: updatedUser.balance,
      };
    } catch (err) {
      console.error('Crash cashout error:', err);
      bet.settled = false;
      return { ok: false, error: "Erreur lors de l'encaissement." };
    } finally {
      this.processingCashouts.delete(userId);
    }
  }
}

export const crashEngine = new CrashEngine();
