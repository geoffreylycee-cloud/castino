import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ECONOMY, type ChatMessageDTO } from '@castino/shared';
import { ENV } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { emitBalanceUpdate, getOnlineUserIds, getSocketServer } from '../../socket/hub.js';
import { rainEngine } from '../../socket/rain.engine.js';
import { ensureActiveSeed } from '../fairness/fairness.service.js';

/**
 * Crée ou met à jour automatiquement le compte Admin défini dans .env au démarrage du serveur
 */
export async function ensureAdminAccount(): Promise<void> {
  const username = ENV.ADMIN_USERNAME.trim();
  const password = ENV.ADMIN_PASSWORD;
  if (!username || !password) return;

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { username } });
    if (existing) {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          role: 'ADMIN',
          isGuest: false,
          isBanned: false,
          passwordHash,
        },
      });
      await ensureActiveSeed(tx, existing.id);
    } else {
      const created = await tx.user.create({
        data: {
          username,
          passwordHash,
          role: 'ADMIN',
          isGuest: false,
          avatarSeed: 'admin',
          balance: 10_000_000, // 100 000.00 $ de départ pour le compte admin
        },
      });
      await ensureActiveSeed(tx, created.id);
    }
  });

  console.log(`🛡️ Compte Administrateur prêt : "${username}"`);
}

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// Vue globale : stats + tous les joueurs (en ligne et hors ligne) + chat récent
adminRouter.get('/overview', async (_req, res) => {
  try {
    const onlineSet = getOnlineUserIds();

    const [users, totalBets, totalInventoryItems, recentMessages] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ role: 'desc' }, { balance: 'desc' }],
        include: {
          _count: {
            select: {
              bets: true,
              inventory: { where: { status: 'IN_INVENTORY' } },
            },
          },
        },
      }),
      prisma.betHistory.count(),
      prisma.inventoryItem.count({ where: { status: 'IN_INVENTORY' } }),
      prisma.chatMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { user: { select: { id: true, username: true, isGuest: true } } },
      }),
    ]);

    const totalBalanceInCirculation = users.reduce((sum, u) => sum + u.balance, 0);
    const totalWagered = users.reduce((sum, u) => sum + u.totalWagered, 0);

    res.json({
      stats: {
        totalUsers: users.length,
        onlineUsersCount: onlineSet.size,
        registeredUsers: users.filter((u) => !u.isGuest).length,
        guestUsers: users.filter((u) => u.isGuest).length,
        totalBalanceInCirculation,
        totalWagered,
        totalBets,
        totalInventoryItems,
      },
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        isGuest: u.isGuest,
        isBanned: u.isBanned,
        isOnline: onlineSet.has(u.id),
        balance: u.balance,
        totalWagered: u.totalWagered,
        totalWon: u.totalWon,
        inventoryCount: u._count.inventory,
        betsCount: u._count.bets,
        createdAt: u.createdAt.toISOString(),
      })),
      chatMessages: recentMessages.map((m) => ({
        id: m.id,
        userId: m.user.id,
        username: m.user.username,
        isGuest: m.user.isGuest,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement du panel admin.' });
  }
});

// Modifier le solde d'un joueur (SET / ADD / SUB) avec mise à jour temps réel Socket.io
const balanceSchema = z.object({
  mode: z.enum(['SET', 'ADD', 'SUB']),
  amountCents: z.number().int().min(0).max(500_000_000),
});

adminRouter.post('/users/:id/balance', async (req, res) => {
  try {
    const parsed = balanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Montant ou mode invalide.' });
      return;
    }

    const targetId = String(req.params.id);
    const { mode, amountCents } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) {
      res.status(404).json({ error: 'Joueur introuvable.' });
      return;
    }

    let nextBalance = user.balance;
    if (mode === 'SET') nextBalance = amountCents;
    else if (mode === 'ADD') nextBalance = Math.min(1_000_000_000, user.balance + amountCents);
    else if (mode === 'SUB') nextBalance = Math.max(0, user.balance - amountCents);

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { balance: nextBalance },
    });

    emitBalanceUpdate(targetId, updated.balance, 'ADMIN_ADJUST');
    res.json({ ok: true, userId: targetId, balance: updated.balance });
  } catch (err) {
    console.error('Admin balance error:', err);
    res.status(500).json({ error: 'Impossible de modifier le solde.' });
  }
});

// Bannir / Débannir un joueur
adminRouter.post('/users/:id/ban', async (req, res) => {
  try {
    const targetId = String(req.params.id);
    if (targetId === req.user!.userId) {
      res.status(400).json({ error: 'Impossible de bannir votre propre compte admin.' });
      return;
    }

    const isBanned = Boolean(req.body?.isBanned);
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { isBanned },
    });

    res.json({ ok: true, userId: updated.id, isBanned: updated.isBanned });
  } catch (err) {
    console.error('Admin ban error:', err);
    res.status(500).json({ error: 'Erreur lors du changement de statut.' });
  }
});

// Offrir un skin CS2 directement dans l'inventaire d'un joueur
adminRouter.post('/users/:id/give-item', async (req, res) => {
  try {
    const targetId = String(req.params.id);
    const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
    if (!itemId) {
      res.status(400).json({ error: 'Skin invalide.' });
      return;
    }

    const [user, item] = await Promise.all([
      prisma.user.findUnique({ where: { id: targetId } }),
      prisma.item.findUnique({ where: { id: itemId } }),
    ]);

    if (!user || !item) {
      res.status(404).json({ error: 'Joueur ou skin introuvable.' });
      return;
    }

    await prisma.inventoryItem.create({
      data: {
        userId: user.id,
        itemId: item.id,
        status: 'IN_INVENTORY',
        acquiredValue: item.value,
      },
    });

    res.json({ ok: true, itemName: item.name, username: user.username });
  } catch (err) {
    console.error('Admin give-item error:', err);
    res.status(500).json({ error: "Impossible d'ajouter le skin." });
  }
});

// Supprimer un compte joueur
adminRouter.delete('/users/:id', async (req, res) => {
  try {
    const targetId = String(req.params.id);
    if (targetId === req.user!.userId) {
      res.status(400).json({ error: 'Impossible de supprimer votre compte admin.' });
      return;
    }

    await prisma.user.delete({ where: { id: targetId } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Nettoyer les invités hors ligne inactifs (0 paris)
adminRouter.post('/users/cleanup-guests', async (_req, res) => {
  try {
    const onlineIds = Array.from(getOnlineUserIds());
    const deleted = await prisma.user.deleteMany({
      where: {
        isGuest: true,
        role: 'USER',
        id: { notIn: onlineIds },
        bets: { none: {} },
      },
    });
    res.json({ ok: true, deletedCount: deleted.count });
  } catch (err) {
    console.error('Admin cleanup guests error:', err);
    res.status(500).json({ error: 'Erreur nettoyage invités.' });
  }
});

// Supprimer un message du chat
adminRouter.delete('/chat/:id', async (req, res) => {
  try {
    await prisma.chatMessage.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin delete chat error:', err);
    res.status(500).json({ error: 'Message introuvable.' });
  }
});

// Vider tout le chat global
adminRouter.delete('/chat', async (_req, res) => {
  try {
    await prisma.chatMessage.deleteMany({});
    getSocketServer()?.emit('chat:history', []);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin clear chat error:', err);
    res.status(500).json({ error: 'Erreur lors du nettoyage du chat.' });
  }
});

// Envoyer une annonce Admin dans le chat global
adminRouter.post('/chat/announce', async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 220) {
      res.status(400).json({ error: 'Annonce vide ou trop longue.' });
      return;
    }

    const admin = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
    const saved = await prisma.chatMessage.create({
      data: {
        userId: admin.id,
        text: `📢 [ANNONCE] ${text}`,
      },
    });

    const msgDTO: ChatMessageDTO = {
      id: saved.id,
      userId: admin.id,
      username: admin.username,
      isGuest: false,
      text: saved.text,
      createdAt: saved.createdAt.toISOString(),
    };
    getSocketServer()?.emit('chat:message', msgDTO);
    res.json({ ok: true, message: msgDTO });
  } catch (err) {
    console.error('Admin announce error:', err);
    res.status(500).json({ error: "Impossible d'envoyer l'annonce." });
  }
});

// Forcer une Rain dans le chat avec un pot personnalisé
adminRouter.post('/rain/force', async (req, res) => {
  try {
    const potCents = parseInt(String(req.body?.potCents || '250000'), 10);
    const durationSec = Math.min(180, Math.max(15, parseInt(String(req.body?.durationSeconds || '45'), 10)));
    if (Number.isNaN(potCents) || potCents < 10_000 || potCents > 500_000_000) {
      res.status(400).json({ error: 'Montant de Rain invalide (min 100 $, max 5 000 000 $).' });
      return;
    }

    rainEngine.startRain(potCents, `Admin (${req.user!.username})`, durationSec * 1000);
    res.json({ ok: true, rain: rainEngine.getSnapshot() });
  } catch (err) {
    console.error('Admin force rain error:', err);
    res.status(500).json({ error: 'Impossible de lancer la Rain.' });
  }
});

// Ajouter du bonus dans le pot de la Rain en cours (sans débiter l'admin)
adminRouter.post('/rain/add-pot', async (req, res) => {
  try {
    const amountCents = parseInt(String(req.body?.amountCents || '100000'), 10);
    if (Number.isNaN(amountCents) || amountCents < 1000 || amountCents > 500_000_000) {
      res.status(400).json({ error: 'Montant invalide.' });
      return;
    }

    rainEngine.adminAddToPot(amountCents, req.user!.username);
    res.json({ ok: true, rain: rainEngine.getSnapshot() });
  } catch (err) {
    console.error('Admin add rain pot error:', err);
    res.status(500).json({ error: 'Erreur lors de l’ajout au pot.' });
  }
});

export const ADMIN_CONSTANTS = { ECONOMY };
