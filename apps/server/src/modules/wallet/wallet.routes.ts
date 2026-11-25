import { Router } from 'express';
import { ECONOMY, formatCredits } from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { emitBalanceUpdate } from '../../socket/hub.js';
import { toUserDTO } from '../auth/auth.routes.js';

export const walletRouter = Router();

walletRouter.post('/faucet', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }

    if (user.balance >= ECONOMY.FAUCET_MAX_BALANCE_THRESHOLD) {
      res.status(400).json({
        error: `Le Faucet gratuit est disponible uniquement lorsque votre solde est inférieur à ${formatCredits(
          ECONOMY.FAUCET_MAX_BALANCE_THRESHOLD
        )} $.`,
      });
      return;
    }

    if (user.lastFaucetAt) {
      const elapsedSec = (Date.now() - user.lastFaucetAt.getTime()) / 1000;
      if (elapsedSec < ECONOMY.FAUCET_COOLDOWN_SECONDS) {
        const wait = Math.ceil(ECONOMY.FAUCET_COOLDOWN_SECONDS - elapsedSec);
        const mins = Math.floor(wait / 60);
        const secs = wait % 60;
        const formatted = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
        res.status(429).json({
          error: `Faucet disponible toutes les 3 minutes. Patientez encore ${formatted}.`,
          retryAfterSeconds: wait,
        });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        balance: { increment: ECONOMY.FAUCET_AMOUNT },
        lastFaucetAt: new Date(),
      },
    });

    emitBalanceUpdate(userId, updated.balance, 'FAUCET');
    res.json({
      added: ECONOMY.FAUCET_AMOUNT,
      balance: updated.balance,
      user: toUserDTO(updated),
    });
  } catch (err) {
    console.error('Faucet error:', err);
    res.status(500).json({ error: 'Erreur lors du rechargement Faucet.' });
  }
});
