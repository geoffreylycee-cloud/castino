import { Router } from 'express';
import type { InventoryItemDTO, ItemRarity } from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { emitBalanceUpdate } from '../../socket/hub.js';

export const inventoryRouter = Router();

inventoryRouter.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const rows = await prisma.inventoryItem.findMany({
      where: { userId, status: 'IN_INVENTORY' },
      include: {
        item: true,
        originCase: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { acquiredAt: 'desc' },
    });

    const items: InventoryItemDTO[] = rows.map((r) => ({
      id: r.id,
      status: 'IN_INVENTORY',
      acquiredValue: r.acquiredValue,
      soldValue: r.soldValue,
      acquiredAt: r.acquiredAt.toISOString(),
      item: {
        id: r.item.id,
        name: r.item.name,
        slug: r.item.slug,
        weaponOrCategory: r.item.weaponOrCategory,
        imageUrl: r.item.imageUrl,
        rarity: r.item.rarity as ItemRarity,
        value: r.item.value,
      },
      originCase: r.originCase,
    }));

    const totalValue = items.reduce((acc, it) => acc + it.item.value, 0);
    res.json({ items, totalValue, count: items.length });
  } catch (err) {
    console.error('Inventory list error:', err);
    res.status(500).json({ error: "Erreur lors du chargement de l'inventaire." });
  }
});

inventoryRouter.post('/:id/sell', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const invId = String(req.params.id);

    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventoryItem.findFirst({
        where: { id: invId, userId, status: 'IN_INVENTORY' },
        include: { item: true },
      });
      if (!inv) {
        throw new Error('ITEM_NOT_FOUND');
      }

      const sellPrice = inv.item.value;
      await tx.inventoryItem.update({
        where: { id: inv.id },
        data: {
          status: 'SOLD',
          soldValue: sellPrice,
          soldAt: new Date(),
        },
      });

      const user = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { increment: sellPrice },
        },
      });

      return { sellPrice, newBalance: user.balance, itemName: inv.item.name };
    });

    emitBalanceUpdate(userId, result.newBalance, 'ITEM_SOLD');
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'ITEM_NOT_FOUND') {
      res.status(404).json({ error: 'Objet introuvable ou déjà vendu.' });
      return;
    }
    console.error('Inventory sell error:', err);
    res.status(500).json({ error: 'Erreur lors de la revente.' });
  }
});

inventoryRouter.post('/sell-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
      const items = await tx.inventoryItem.findMany({
        where: { userId, status: 'IN_INVENTORY' },
        include: { item: true },
      });

      if (items.length === 0) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        return { soldCount: 0, totalCredited: 0, newBalance: user.balance };
      }

      const totalCredited = items.reduce((sum, i) => sum + i.item.value, 0);
      const now = new Date();

      for (const inv of items) {
        await tx.inventoryItem.update({
          where: { id: inv.id },
          data: {
            status: 'SOLD',
            soldValue: inv.item.value,
            soldAt: now,
          },
        });
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: totalCredited } },
      });

      return {
        soldCount: items.length,
        totalCredited,
        newBalance: updatedUser.balance,
      };
    });

    emitBalanceUpdate(userId, result.newBalance, 'INVENTORY_SELL_ALL');
    res.json(result);
  } catch (err) {
    console.error('Inventory sell-all error:', err);
    res.status(500).json({ error: 'Erreur lors de la vente groupée.' });
  }
});
