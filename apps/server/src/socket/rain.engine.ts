import crypto from 'node:crypto';
import {
  formatCredits,
  type ChatMessageDTO,
  type RainSnapshotDTO,
  type RainStatus,
} from '@castino/shared';
import { prisma } from '../lib/prisma.js';
import { emitBalanceUpdate, getSocketServer } from './hub.js';

const AUTO_RAIN_INTERVAL_MS = 180_000; // 3 minutes
const RAIN_ACTIVE_DURATION_MS = 45_000; // 45 secondes pour rejoindre

class RainEngine {
  private id = 'rain_init';
  private status: RainStatus = 'COOLDOWN';
  private potCents = 0;
  private participants = new Map<string, string>(); // userId -> username
  private endsAt = Date.now() + AUTO_RAIN_INTERVAL_MS;
  private startedBy = 'Auto';
  private timer: NodeJS.Timeout | null = null;

  init(): void {
    this.scheduleNextAutoRain();
  }

  getSnapshot(): RainSnapshotDTO {
    return {
      id: this.id,
      status: this.status,
      potCents: this.potCents,
      participants: Array.from(this.participants.entries()).map(([userId, username]) => ({
        userId,
        username,
      })),
      endsAt: this.endsAt,
      serverNow: Date.now(),
      startedBy: this.startedBy,
    };
  }

  private broadcast(): void {
    getSocketServer()?.emit('rain:snapshot', this.getSnapshot());
  }

  private emitSystemChat(text: string): void {
    const msg: ChatMessageDTO = {
      id: `rain-sys-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      userId: 'system',
      username: '🌧️ CaSTIno Rain',
      isGuest: false,
      text,
      createdAt: new Date().toISOString(),
    };
    getSocketServer()?.emit('chat:message', msg);
  }

  private scheduleNextAutoRain(): void {
    if (this.timer) clearTimeout(this.timer);
    this.status = 'COOLDOWN';
    this.participants.clear();
    this.potCents = 0;
    this.endsAt = Date.now() + AUTO_RAIN_INTERVAL_MS;
    this.startedBy = 'Auto';
    this.broadcast();

    this.timer = setTimeout(() => {
      // Pot aléatoire entre 1 000 $ et 5 000 $ (par tranches de 100 $)
      const randomHundreds = crypto.randomInt(10, 51); // 10..50 -> 1000..5000 $
      this.startRain(randomHundreds * 10_000, 'Auto', RAIN_ACTIVE_DURATION_MS);
    }, AUTO_RAIN_INTERVAL_MS);
  }

  startRain(
    potCents: number,
    startedBy = 'Auto',
    durationMs = RAIN_ACTIVE_DURATION_MS
  ): void {
    if (this.timer) clearTimeout(this.timer);

    this.id = `rain_${Date.now().toString(36)}`;
    this.status = 'ACTIVE';
    this.potCents = Math.max(10_000, Math.min(500_000_000, Math.round(potCents)));
    this.participants.clear();
    this.endsAt = Date.now() + durationMs;
    this.startedBy = startedBy;

    this.broadcast();
    this.emitSystemChat(
      `Nouvelle Rain de ${formatCredits(this.potCents)} $ lancée (${startedBy}) ! Cliquez sur "Rejoindre" en haut du chat !`
    );

    this.timer = setTimeout(() => {
      void this.finishRain();
    }, durationMs);
  }

  adminAddToPot(amountCents: number, adminUsername: string): { ok: boolean; error?: string } {
    if (this.status !== 'ACTIVE') {
      // Si aucune rain en cours, on en démarre une immédiatement avec ce montant !
      this.startRain(amountCents, `Admin (${adminUsername})`, RAIN_ACTIVE_DURATION_MS);
      return { ok: true };
    }
    this.potCents = Math.min(500_000_000, this.potCents + amountCents);
    this.broadcast();
    this.emitSystemChat(
      `${adminUsername} (Admin) a ajouté +${formatCredits(amountCents)} $ dans la Rain ! Pot actuel : ${formatCredits(
        this.potCents
      )} $`
    );
    return { ok: true };
  }

  async joinRain(userId: string): Promise<{ ok: boolean; error?: string }> {
    if (this.status !== 'ACTIVE') {
      return { ok: false, error: 'Aucune Rain active pour le moment.' };
    }
    if (this.participants.has(userId)) {
      return { ok: false, error: 'Vous participez déjà à cette Rain !' };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isBanned) {
      return { ok: false, error: 'Compte invalide.' };
    }

    this.participants.set(userId, user.username);
    this.broadcast();
    return { ok: true };
  }

  async tipRain(
    userId: string,
    amountCents: number
  ): Promise<{ ok: boolean; error?: string; newBalance?: number }> {
    if (this.status !== 'ACTIVE') {
      return { ok: false, error: 'Aucune Rain active à alimenter.' };
    }
    if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 100_000_000) {
      return { ok: false, error: 'Montant minimum : 1,00 $.' };
    }

    try {
      const txRes = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('USER_NOT_FOUND');
        if (user.balance < amountCents) throw new Error('INSUFFICIENT_BALANCE');

        const updated = await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: amountCents } },
        });
        return { username: user.username, newBalance: updated.balance };
      });

      this.potCents = Math.min(500_000_000, this.potCents + amountCents);
      this.participants.set(userId, txRes.username);
      emitBalanceUpdate(userId, txRes.newBalance, 'RAIN_TIP');
      this.broadcast();
      this.emitSystemChat(
        `${txRes.username} a ajouté +${formatCredits(amountCents)} $ dans la Rain ! Pot : ${formatCredits(
          this.potCents
        )} $`
      );

      return { ok: true, newBalance: txRes.newBalance };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
        return { ok: false, error: 'Solde insuffisant.' };
      }
      console.error('Rain tip error:', err);
      return { ok: false, error: 'Impossible d’ajouter au pot.' };
    }
  }

  private async finishRain(): Promise<void> {
    const joined = Array.from(this.participants.entries());
    const finalPot = this.potCents;

    if (joined.length > 0 && finalPot > 0) {
      const share = Math.floor(finalPot / joined.length);

      for (const [uid] of joined) {
        try {
          const updated = await prisma.user.update({
            where: { id: uid },
            data: { balance: { increment: share } },
          });
          emitBalanceUpdate(uid, updated.balance, 'RAIN_PAYOUT');
        } catch (err) {
          console.error('Rain payout error for user', uid, err);
        }
      }

      this.emitSystemChat(
        `Rain terminée ! ${formatCredits(finalPot)} $ partagés entre ${joined.length} joueur(s) (+${formatCredits(
          share
        )} $ chacun) !`
      );
    } else {
      this.emitSystemChat('Rain terminée sans participant. Prochaine Rain dans 3 minutes !');
    }

    this.scheduleNextAutoRain();
  }
}

export const rainEngine = new RainEngine();
