import crypto from 'node:crypto';
import { Router } from 'express';
import {
  ECONOMY,
  RARITIES,
  rollCaseTicket,
  type CaseDTO,
  type CaseItemDTO,
  type CaseOpenResponse,
  type ItemDTO,
  type ItemRarity,
} from '@castino/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middlewares/auth.js';
import { consumeFairnessNonce } from '../fairness/fairness.service.js';
import { broadcastFeedEvent, emitBalanceUpdate } from '../../socket/hub.js';

function mapItemDTO(item: {
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

function pickWeightedDummyItem(caseItems: CaseItemDTO[]): ItemDTO {
  const rand = crypto.randomInt(0, ECONOMY.CASE_TOTAL_TICKETS);
  const found = caseItems.find((ci) => rand >= ci.ticketStart && rand <= ci.ticketEnd);
  return found ? found.item : caseItems[0].item;
}

function buildSpinnerReel(caseItems: CaseItemDTO[], wonItem: ItemDTO, winningIndex = 42): ItemDTO[] {
  const totalCards = 52;
  const reel: ItemDTO[] = [];
  for (let i = 0; i < totalCards; i++) {
    if (i === winningIndex) {
      reel.push(wonItem);
    } else {
      reel.push(pickWeightedDummyItem(caseItems));
    }
  }
  return reel;
}

export const casesRouter = Router();

casesRouter.get('/', async (_req, res) => {
  try {
    const cases = await prisma.case.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          include: { item: true },
          orderBy: { item: { value: 'asc' } },
        },
      },
    });

    const payload: CaseDTO[] = cases.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      price: c.price,
      category: c.category,
      items: c.items.map((ci) => ({
        id: ci.id,
        weight: ci.weight,
        ticketStart: ci.ticketStart,
        ticketEnd: ci.ticketEnd,
        chancePercent: +(ci.weight / 1000).toFixed(3),
        item: mapItemDTO(ci.item),
      })),
    }));

    res.json({ cases: payload });
  } catch (err) {
    console.error('Get cases error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des caisses.' });
  }
});

casesRouter.get('/:slug', async (req, res) => {
  try {
    const c = await prisma.case.findUnique({
      where: { slug: req.params.slug },
      include: {
        items: {
          include: { item: true },
          orderBy: { item: { value: 'asc' } },
        },
      },
    });

    if (!c || !c.isActive) {
      res.status(404).json({ error: 'Caisse introuvable.' });
      return;
    }

    const dto: CaseDTO = {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      price: c.price,
      category: c.category,
      items: c.items.map((ci) => ({
        id: ci.id,
        weight: ci.weight,
        ticketStart: ci.ticketStart,
        ticketEnd: ci.ticketEnd,
        chancePercent: +(ci.weight / 1000).toFixed(3),
        item: mapItemDTO(ci.item),
      })),
    };

    res.json({ case: dto });
  } catch (err) {
    console.error('Get case detail error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Ouverture gratuite de démonstration (sans débiter ni ajouter à l'inventaire)
casesRouter.post('/:slug/demo', async (req, res) => {
  try {
    const c = await prisma.case.findUnique({
      where: { slug: req.params.slug },
      include: { items: { include: { item: true } } },
    });
    if (!c || c.items.length === 0) {
      res.status(404).json({ error: 'Caisse introuvable.' });
      return;
    }

    const mappedItems: CaseItemDTO[] = c.items.map((ci) => ({
      id: ci.id,
      weight: ci.weight,
      ticketStart: ci.ticketStart,
      ticketEnd: ci.ticketEnd,
      chancePercent: +(ci.weight / 1000).toFixed(3),
      item: mapItemDTO(ci.item),
    }));

    const rollTicket = crypto.randomInt(0, ECONOMY.CASE_TOTAL_TICKETS);
    const hit = mappedItems.find((ci) => rollTicket >= ci.ticketStart && rollTicket <= ci.ticketEnd) || mappedItems[0];
    const winningIndex = 42;
    const reelItems = buildSpinnerReel(mappedItems, hit.item, winningIndex);

    res.json({
      isDemo: true,
      rollTicket,
      wonItem: hit.item,
      reelItems,
      winningIndex,
    });
  } catch (err) {
    console.error('Demo open error:', err);
    res.status(500).json({ error: 'Erreur lors du tirage démo.' });
  }
});

// Ouverture réelle Provably Fair
casesRouter.post('/:slug/open', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const slug = String(req.params.slug);
    const c = await prisma.case.findUnique({
      where: { slug },
      include: { items: { include: { item: true } } },
    });

    if (!c || !c.isActive || c.items.length === 0) {
      res.status(404).json({ error: 'Caisse introuvable.' });
      return;
    }

    const mappedItems: CaseItemDTO[] = c.items.map((ci) => ({
      id: ci.id,
      weight: ci.weight,
      ticketStart: ci.ticketStart,
      ticketEnd: ci.ticketEnd,
      chancePercent: +(ci.weight / 1000).toFixed(3),
      item: mapItemDTO(ci.item),
    }));

    const txResult = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }
      if (user.balance < c.price) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      // Caisse gratuite ($0) : cooldown de 60s par joueur
      if (c.price === 0) {
        const lastFree = await tx.betHistory.findFirst({
          where: { userId, gameType: 'CASE_OPENING', wager: 0 },
          orderBy: { createdAt: 'desc' },
        });
        if (lastFree) {
          const elapsed = (Date.now() - lastFree.createdAt.getTime()) / 1000;
          if (elapsed < ECONOMY.FREE_CASE_COOLDOWN_SECONDS) {
            const wait = Math.ceil(ECONOMY.FREE_CASE_COOLDOWN_SECONDS - elapsed);
            throw new Error(`FREE_CASE_COOLDOWN:${wait}`);
          }
        }
      }

      const fairness = await consumeFairnessNonce(tx, userId);
      const rollTicket = rollCaseTicket(fairness.serverSeed, fairness.clientSeed, fairness.nonceUsed);
      const hit =
        mappedItems.find((ci) => rollTicket >= ci.ticketStart && rollTicket <= ci.ticketEnd) ||
        mappedItems[0];

      const wonItem = hit.item;
      const multiplier = c.price > 0 ? Math.round((wonItem.value / c.price) * 100) / 100 : 1;
      const profit = wonItem.value - c.price;

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: c.price },
          totalWagered: { increment: c.price },
          totalWon: { increment: wonItem.value },
        },
      });

      const bet = await tx.betHistory.create({
        data: {
          userId,
          gameType: 'CASE_OPENING',
          status: wonItem.value >= c.price ? 'WON' : 'LOST',
          wager: c.price,
          multiplier,
          payout: wonItem.value,
          profit,
          fairnessSeedId: fairness.seedId,
          nonceUsed: fairness.nonceUsed,
          gameData: JSON.stringify({
            caseId: c.id,
            caseSlug: c.slug,
            caseName: c.name,
            rollTicket,
            droppedItemId: wonItem.id,
            droppedItemName: wonItem.name,
          }),
        },
      });

      const invItem = await tx.inventoryItem.create({
        data: {
          userId,
          itemId: wonItem.id,
          originCaseId: c.id,
          betHistoryId: bet.id,
          status: 'IN_INVENTORY',
          acquiredValue: wonItem.value,
        },
        include: {
          item: true,
          originCase: { select: { id: true, name: true, slug: true } },
        },
      });

      return {
        username: user.username,
        newBalance: updatedUser.balance,
        betId: bet.id,
        rollTicket,
        nonceUsed: fairness.nonceUsed,
        wonItem,
        multiplier,
        invItem,
      };
    });

    const winningIndex = 42;
    const reelItems = buildSpinnerReel(mappedItems, txResult.wonItem, winningIndex);

    emitBalanceUpdate(userId, txResult.newBalance, 'CASE_OPEN');

    // Diffusion dans le Live Feed pour chaque vraie ouverture de joueur
    broadcastFeedEvent({
      id: txResult.betId,
      type: 'CASE_DROP',
      username: txResult.username,
      isBot: false,
      gameType: 'CASE_OPENING',
      title: `${txResult.wonItem.weaponOrCategory ? txResult.wonItem.weaponOrCategory + ' | ' : ''}${txResult.wonItem.name}`,
      subtitle: c.name,
      amount: txResult.wonItem.value,
      multiplier: txResult.multiplier,
      rarity: txResult.wonItem.rarity,
      imageUrl: txResult.wonItem.imageUrl,
      createdAt: new Date().toISOString(),
    });

    const response: CaseOpenResponse = {
      betId: txResult.betId,
      rollTicket: txResult.rollTicket,
      nonceUsed: txResult.nonceUsed,
      wonItem: txResult.wonItem,
      inventoryItem: {
        id: txResult.invItem.id,
        status: 'IN_INVENTORY',
        acquiredValue: txResult.invItem.acquiredValue,
        soldValue: null,
        acquiredAt: txResult.invItem.acquiredAt.toISOString(),
        item: txResult.wonItem,
        originCase: txResult.invItem.originCase,
      },
      reelItems,
      winningIndex,
      newBalance: txResult.newBalance,
    };

    res.json(response);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ error: 'Solde insuffisant pour ouvrir cette caisse.' });
      return;
    }
    if (err instanceof Error && err.message.startsWith('FREE_CASE_COOLDOWN:')) {
      const wait = err.message.split(':')[1];
      res.status(429).json({ error: `Caisse gratuite disponible dans ${wait}s.` });
      return;
    }
    console.error('Open case error:', err);
    res.status(500).json({ error: "Erreur lors de l'ouverture de la caisse." });
  }
});
