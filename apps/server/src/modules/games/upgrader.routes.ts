import { Router } from 'express';
import { z } from 'zod';
import {
  ECONOMY,
  generateFloats,
  type ItemDTO,
  type ItemRarity,
  type UpgraderPlayResponse,
} from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { consumeFairnessNonce } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

const playUpgraderSchema = z.object({
  inventoryItemIds: z.array(z.string()).max(12).default([]),
  balanceAddCents: z.number().int().min(0).max(ECONOMY.MAX_WAGER).default(0),
  targetItemId: z.string().min(1),
  rollMode: z.enum(['UNDER', 'OVER']).default('UNDER'),
});

function mapItem(item: {
  id: string;
  name: string;
  slug: string;
  weaponOrCategory: string | null;
  imageUrl: string;
  rarity: string;
  value: number;
}): ItemDTO {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    weaponOrCategory: item.weaponOrCategory,
    imageUrl: item.imageUrl,
    rarity: item.rarity as ItemRarity,
    value: item.value,
  };
}

export const upgraderRouter = Router();

// Liste des skins cibles disponibles parmi les 24 caisses CS2 actives
upgraderRouter.get('/targets', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const rarity = typeof req.query.rarity === 'string' ? req.query.rarity : 'ALL';
    const minPrice = req.query.minPrice ? parseInt(String(req.query.minPrice), 10) : 0;
    const maxPrice = req.query.maxPrice ? parseInt(String(req.query.maxPrice), 10) : 0;
    const sort = req.query.sort === 'desc' ? 'desc' : 'asc';
    const limit = Math.min(80, Math.max(10, parseInt(String(req.query.limit || '48'), 10)));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10));

    const where: Record<string, unknown> = {
      caseItems: { some: { case: { isActive: true } } },
    };

    if (rarity !== 'ALL' && ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'].includes(rarity)) {
      where.rarity = rarity;
    }

    if (minPrice > 0 || maxPrice > 0) {
      const valueFilter: Record<string, number> = {};
      if (minPrice > 0) valueFilter.gte = minPrice;
      if (maxPrice > 0) valueFilter.lte = maxPrice;
      where.value = valueFilter;
    }

    const allMatching = await prisma.item.findMany({
      where,
      orderBy: { value: sort },
    });

    const filtered = search
      ? allMatching.filter(
          (it) =>
            it.name.toLowerCase().includes(search) ||
            (it.weaponOrCategory || '').toLowerCase().includes(search)
        )
      : allMatching;

    const page = filtered.slice(offset, offset + limit).map(mapItem);
    res.json({
      items: page,
      total: filtered.length,
    });
  } catch (err) {
    console.error('Upgrader targets error:', err);
    res.status(500).json({ error: 'Impossible de charger les skins cibles.' });
  }
});

// Exécuter un Upgrade Provably Fair
upgraderRouter.post('/play', requireAuth, async (req, res) => {
  try {
    const parsed = playUpgraderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Paramètres d’upgrade invalides.' });
      return;
    }

    const userId = req.user!.userId;
    const { inventoryItemIds, balanceAddCents, targetItemId, rollMode } = parsed.data;
    const uniqueInvIds = Array.from(new Set(inventoryItemIds));

    if (uniqueInvIds.length === 0 && balanceAddCents < ECONOMY.MIN_WAGER) {
      res.status(400).json({ error: 'Sélectionnez au moins un skin ou ajoutez du solde.' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.balance < balanceAddCents) throw new Error('INSUFFICIENT_BALANCE');

      const targetItem = await tx.item.findUnique({ where: { id: targetItemId } });
      if (!targetItem) throw new Error('TARGET_NOT_FOUND');

      const invItems =
        uniqueInvIds.length > 0
          ? await tx.inventoryItem.findMany({
              where: {
                id: { in: uniqueInvIds },
                userId,
                status: 'IN_INVENTORY',
              },
              include: { item: true },
            })
          : [];

      if (invItems.length !== uniqueInvIds.length) {
        throw new Error('INVALID_INVENTORY_ITEMS');
      }

      const skinsValue = invItems.reduce((sum, inv) => sum + inv.item.value, 0);
      const totalInputValue = skinsValue + balanceAddCents;

      if (totalInputValue <= 0) throw new Error('EMPTY_INPUT');
      if (targetItem.value <= totalInputValue) {
        throw new Error('TARGET_MUST_BE_HIGHER');
      }

      // Probabilité style Hellcase (RTP 96%, plafonnée entre 1.000% et 80.000%)
      const rawChance = (totalInputValue / targetItem.value) * 96;
      if (rawChance < 1) {
        throw new Error('CHANCE_TOO_LOW');
      }
      const chancePercent = Math.min(80, Math.round(rawChance * 1000) / 1000);
      const multiplier = Math.round((targetItem.value / totalInputValue) * 100) / 100;

      // Consommer les skins mis en jeu
      const now = new Date();
      if (uniqueInvIds.length > 0) {
        await tx.inventoryItem.updateMany({
          where: { id: { in: uniqueInvIds }, userId, status: 'IN_INVENTORY' },
          data: { status: 'SOLD', soldValue: 0, soldAt: now },
        });
      }

      const fairness = await consumeFairnessNonce(tx, userId);
      const [flt] = generateFloats(fairness.serverSeed, fairness.clientSeed, fairness.nonceUsed, 1);
      const roll = Math.floor(flt * 100000) / 1000; // 0.000 à 99.999

      const won =
        rollMode === 'UNDER' ? roll < chancePercent : roll >= 100 - chancePercent;

      const payout = won ? targetItem.value : 0;
      const profit = payout - totalInputValue;

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: balanceAddCents },
          totalWagered: { increment: totalInputValue },
          totalWon: { increment: payout },
        },
      });

      const bet = await tx.betHistory.create({
        data: {
          userId,
          gameType: 'UPGRADER',
          status: won ? 'WON' : 'LOST',
          wager: totalInputValue,
          multiplier: won ? multiplier : 0,
          payout,
          profit,
          fairnessSeedId: fairness.seedId,
          nonceUsed: fairness.nonceUsed,
          gameData: JSON.stringify({
            targetItemId: targetItem.id,
            targetItemName: targetItem.name,
            chancePercent,
            roll,
            rollMode,
            sacrificedCount: invItems.length,
            balanceAddCents,
          }),
        },
      });

      let wonInventoryItem = null;
      if (won) {
        const createdInv = await tx.inventoryItem.create({
          data: {
            userId,
            itemId: targetItem.id,
            betHistoryId: bet.id,
            status: 'IN_INVENTORY',
            acquiredValue: targetItem.value,
          },
          include: { item: true },
        });

        wonInventoryItem = {
          id: createdInv.id,
          status: 'IN_INVENTORY' as const,
          acquiredValue: createdInv.acquiredValue,
          soldValue: null,
          acquiredAt: createdInv.acquiredAt.toISOString(),
          item: mapItem(createdInv.item),
          originCase: null,
        };
      }

      return {
        betId: bet.id,
        username: user.username,
        won,
        roll,
        chancePercent,
        rollMode,
        totalInputValue,
        multiplier,
        targetItem: mapItem(targetItem),
        wonInventoryItem,
        newBalance: updatedUser.balance,
        nonceUsed: fairness.nonceUsed,
      };
    });

    if (balanceAddCents > 0) {
      emitBalanceUpdate(userId, result.newBalance, 'UPGRADER');
    }

    if (result.won) {
      broadcastFeedEvent({
        id: result.betId,
        type: 'CASE_DROP',
        username: result.username,
        isBot: false,
        gameType: 'UPGRADER',
        title: `${result.targetItem.weaponOrCategory ? result.targetItem.weaponOrCategory + ' | ' : ''}${result.targetItem.name}`,
        subtitle: `Upgrader ${result.chancePercent.toFixed(1)}% (${result.multiplier.toFixed(2)}×)`,
        amount: result.targetItem.value,
        multiplier: result.multiplier,
        rarity: result.targetItem.rarity,
        imageUrl: result.targetItem.imageUrl,
        createdAt: new Date().toISOString(),
      });
    }

    const response: UpgraderPlayResponse = {
      betId: result.betId,
      won: result.won,
      roll: result.roll,
      chancePercent: result.chancePercent,
      rollMode: result.rollMode,
      totalInputValue: result.totalInputValue,
      multiplier: result.multiplier,
      targetItem: result.targetItem,
      wonInventoryItem: result.wonInventoryItem,
      newBalance: result.newBalance,
      nonceUsed: result.nonceUsed,
    };

    res.json(response);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const messages: Record<string, string> = {
        INSUFFICIENT_BALANCE: 'Solde insuffisant pour le complément ajouté.',
        TARGET_NOT_FOUND: 'Skin cible introuvable.',
        INVALID_INVENTORY_ITEMS: 'Certains skins sélectionnés ne sont plus dans votre inventaire.',
        TARGET_MUST_BE_HIGHER: 'Le skin cible doit valoir plus cher que votre mise totale.',
        CHANCE_TOO_LOW: 'La probabilité est inférieure à 1% — augmentez votre mise ou choisissez un skin moins cher.',
      };
      if (messages[err.message]) {
        res.status(400).json({ error: messages[err.message] });
        return;
      }
    }
    console.error('Upgrader play error:', err);
    res.status(500).json({ error: 'Erreur lors de l’upgrade.' });
  }
});
