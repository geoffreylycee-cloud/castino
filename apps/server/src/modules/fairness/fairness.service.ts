import crypto from 'node:crypto';
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { sha256Hex } from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';

export function randomServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function randomClientSeed(): string {
  return `castino-${crypto.randomBytes(6).toString('hex')}`;
}

export async function ensureActiveSeed(
  tx: Prisma.TransactionClient,
  userId: string,
  preferredClientSeed?: string
) {
  const existing = await tx.fairnessSeed.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) return existing;

  const serverSeed = randomServerSeed();
  const serverSeedHash = sha256Hex(serverSeed);
  const clientSeed = preferredClientSeed?.trim() || randomClientSeed();

  return tx.fairnessSeed.create({
    data: {
      userId,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce: 0,
      isActive: true,
    },
  });
}

export async function consumeFairnessNonce(tx: Prisma.TransactionClient, userId: string) {
  const seed = await ensureActiveSeed(tx, userId);
  const nonceUsed = seed.nonce;

  await tx.fairnessSeed.update({
    where: { id: seed.id },
    data: { nonce: { increment: 1 } },
  });

  return {
    seedId: seed.id,
    serverSeed: seed.serverSeed,
    serverSeedHash: seed.serverSeedHash,
    clientSeed: seed.clientSeed,
    nonceUsed,
  };
}

export const fairnessRouter = Router();

fairnessRouter.get('/current', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const active = await prisma.$transaction((tx) => ensureActiveSeed(tx, userId));
    const history = await prisma.fairnessSeed.findMany({
      where: { userId, isActive: false },
      orderBy: { revealedAt: 'desc' },
      take: 10,
    });

    res.json({
      active: {
        id: active.id,
        serverSeedHash: active.serverSeedHash,
        clientSeed: active.clientSeed,
        nonce: active.nonce,
        createdAt: active.createdAt.toISOString(),
      },
      revealedHistory: history.map((s) => ({
        id: s.id,
        serverSeed: s.serverSeed,
        serverSeedHash: s.serverSeedHash,
        clientSeed: s.clientSeed,
        nonce: s.nonce,
        revealedAt: (s.revealedAt || s.createdAt).toISOString(),
      })),
    });
  } catch (err) {
    console.error('Fairness current error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des seeds.' });
  }
});

fairnessRouter.post('/rotate', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const rawClientSeed = typeof req.body?.clientSeed === 'string' ? req.body.clientSeed.trim() : '';
    const nextClientSeed =
      rawClientSeed.length >= 3 && rawClientSeed.length <= 64 ? rawClientSeed : randomClientSeed();

    // Sécurité Stake : impossible de révéler la Server Seed pendant une partie ACTIVE (Mines / Blackjack)
    const activeBet = await prisma.betHistory.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (activeBet) {
      res.status(400).json({
        error: `Terminez d'abord votre partie en cours (${activeBet.gameType}) avant de changer de Server Seed.`,
      });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await ensureActiveSeed(tx, userId);
      const revealed = await tx.fairnessSeed.update({
        where: { id: current.id },
        data: {
          isActive: false,
          revealedAt: new Date(),
        },
      });

      const serverSeed = randomServerSeed();
      const active = await tx.fairnessSeed.create({
        data: {
          userId,
          serverSeed,
          serverSeedHash: sha256Hex(serverSeed),
          clientSeed: nextClientSeed,
          nonce: 0,
          isActive: true,
        },
      });

      return { active, revealed };
    });

    res.json({
      active: {
        id: result.active.id,
        serverSeedHash: result.active.serverSeedHash,
        clientSeed: result.active.clientSeed,
        nonce: result.active.nonce,
        createdAt: result.active.createdAt.toISOString(),
      },
      revealed: {
        id: result.revealed.id,
        serverSeed: result.revealed.serverSeed,
        serverSeedHash: result.revealed.serverSeedHash,
        clientSeed: result.revealed.clientSeed,
        nonce: result.revealed.nonce,
        revealedAt: (result.revealed.revealedAt || new Date()).toISOString(),
      },
    });
  } catch (err) {
    console.error('Fairness rotate error:', err);
    res.status(500).json({ error: 'Erreur lors de la rotation des seeds.' });
  }
});
