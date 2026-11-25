import crypto from 'node:crypto';
import {
  ECONOMY,
  rollCaseTicket,
  sha256Hex,
  type CaseBattleCaseSummary,
  type CaseBattleDTO,
  type CaseBattleMode,
  type CaseBattleRoundSpinDTO,
  type CaseBattleSlotDTO,
  type ItemDTO,
  type ItemRarity,
} from '@castino/shared';
import { prisma } from '../lib/prisma.js';
import { broadcastFeedEvent, emitBalanceUpdate, getSocketServer } from './hub.js';

interface LoadedCaseEntry {
  summary: CaseBattleCaseSummary;
  items: {
    ticketStart: number;
    ticketEnd: number;
    item: ItemDTO;
  }[];
}

interface InternalBattle {
  id: string;
  creatorUserId: string;
  mode: CaseBattleMode;
  isTeamMode: boolean;
  maxPlayers: number;
  reverseMode: boolean;
  fastMode: boolean;
  status: 'WAITING' | 'RUNNING' | 'FINISHED';
  totalCost: number;
  loadedCases: LoadedCaseEntry[];
  slots: CaseBattleSlotDTO[];
  currentRoundIndex: number;
  activeRoundSpin: CaseBattleRoundSpinDTO | null;
  winnerTeam: number | null;
  winnerSlotIndices: number[];
  totalPotValue: number;
  payoutPerWinner: number;
  serverSeed: string;
  serverSeedHash: string;
  publicSeed: string;
  createdAt: string;
  allRoundSpins: CaseBattleRoundSpinDTO[];
}

const MODE_CONFIG: Record<CaseBattleMode, { maxPlayers: number; isTeamMode: boolean }> = {
  '1v1': { maxPlayers: 2, isTeamMode: false },
  '1v1v1': { maxPlayers: 3, isTeamMode: false },
  '1v1v1v1': { maxPlayers: 4, isTeamMode: false },
  '2v2': { maxPlayers: 4, isTeamMode: true },
  '3v3': { maxPlayers: 6, isTeamMode: true },
};

const BATTLE_BOT_NAMES = [
  'Bot_S1mple',
  'Bot_ZywOo',
  'Bot_Niko',
  'Bot_Donk',
  'Bot_Monesy',
  'Bot_KennyS',
  'Bot_Apex',
  'Bot_Shox',
];

function pickWeightedDummy(entries: LoadedCaseEntry['items']): ItemDTO {
  const r = crypto.randomInt(0, ECONOMY.CASE_TOTAL_TICKETS);
  const found = entries.find((e) => r >= e.ticketStart && r <= e.ticketEnd);
  return found ? found.item : entries[0].item;
}

function buildBattleReel(entries: LoadedCaseEntry['items'], wonItem: ItemDTO, winningIndex = 24): ItemDTO[] {
  const total = 32;
  const reel: ItemDTO[] = [];
  for (let i = 0; i < total; i++) {
    reel.push(i === winningIndex ? wonItem : pickWeightedDummy(entries));
  }
  return reel;
}

class BattlesEngine {
  private battles = new Map<string, InternalBattle>();

  private toDTO(b: InternalBattle): CaseBattleDTO {
    return {
      id: b.id,
      creatorUserId: b.creatorUserId,
      mode: b.mode,
      isTeamMode: b.isTeamMode,
      maxPlayers: b.maxPlayers,
      reverseMode: b.reverseMode,
      fastMode: b.fastMode,
      status: b.status,
      totalCost: b.totalCost,
      cases: b.loadedCases.map((lc) => lc.summary),
      slots: b.slots,
      currentRoundIndex: b.currentRoundIndex,
      activeRoundSpin: b.activeRoundSpin,
      winnerTeam: b.winnerTeam,
      winnerSlotIndices: b.winnerSlotIndices,
      totalPotValue: b.totalPotValue,
      payoutPerWinner: b.payoutPerWinner,
      serverSeedHash: b.serverSeedHash,
      serverSeed: b.status === 'FINISHED' ? b.serverSeed : undefined,
      createdAt: b.createdAt,
    };
  }

  getList(): CaseBattleDTO[] {
    return Array.from(this.battles.values())
      .sort((a, b) => {
        const order = { WAITING: 0, RUNNING: 1, FINISHED: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 30)
      .map((b) => this.toDTO(b));
  }

  getById(id: string): CaseBattleDTO | null {
    const b = this.battles.get(id);
    return b ? this.toDTO(b) : null;
  }

  private broadcastListAndBattle(b: InternalBattle): void {
    const io = getSocketServer();
    if (!io) return;
    io.emit('battles:update', this.toDTO(b));
    io.emit('battles:list', this.getList());
  }

  async createBattle(
    userId: string,
    payload: {
      mode: CaseBattleMode;
      reverseMode: boolean;
      fastMode: boolean;
      caseSlugs: string[];
    }
  ): Promise<{ ok: boolean; error?: string; battleId?: string; newBalance?: number }> {
    const cfg = MODE_CONFIG[payload.mode];
    if (!cfg) return { ok: false, error: 'Mode de battle invalide.' };
    if (!Array.isArray(payload.caseSlugs) || payload.caseSlugs.length === 0 || payload.caseSlugs.length > 10) {
      return { ok: false, error: 'Choisissez entre 1 et 10 caisses pour la battle.' };
    }

    // Charger les caisses depuis Prisma
    const uniqueSlugs = Array.from(new Set(payload.caseSlugs));
    const dbCases = await prisma.case.findMany({
      where: { slug: { in: uniqueSlugs }, isActive: true },
      include: { items: { include: { item: true } } },
    });
    const caseBySlug = new Map(dbCases.map((c) => [c.slug, c]));

    const loadedCases: LoadedCaseEntry[] = [];
    for (const slug of payload.caseSlugs) {
      const c = caseBySlug.get(slug);
      if (!c || c.items.length === 0) {
        return { ok: false, error: `Caisse introuvable : ${slug}` };
      }
      if (c.price === 0) {
        return { ok: false, error: 'La caisse gratuite ($0) ne peut pas être utilisée en Case Battle.' };
      }
      loadedCases.push({
        summary: {
          caseId: c.id,
          slug: c.slug,
          name: c.name,
          imageUrl: c.imageUrl,
          price: c.price,
        },
        items: c.items.map((ci) => ({
          ticketStart: ci.ticketStart,
          ticketEnd: ci.ticketEnd,
          item: {
            id: ci.item.id,
            name: ci.item.name,
            slug: ci.item.slug,
            weaponOrCategory: ci.item.weaponOrCategory,
            imageUrl: ci.item.imageUrl,
            rarity: ci.item.rarity as ItemRarity,
            value: ci.item.value,
          },
        })),
      });
    }

    const totalCost = loadedCases.reduce((sum, lc) => sum + lc.summary.price, 0);

    try {
      const txRes = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('USER_NOT_FOUND');
        if (user.balance < totalCost) throw new Error('INSUFFICIENT_BALANCE');

        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            balance: { decrement: totalCost },
            totalWagered: { increment: totalCost },
          },
        });

        return { username: user.username, newBalance: updated.balance };
      });

      const battleId = `btl_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const slots: CaseBattleSlotDTO[] = Array.from({ length: cfg.maxPlayers }, (_, idx) => {
        const team = cfg.isTeamMode ? (idx < cfg.maxPlayers / 2 ? 0 : 1) : idx;
        if (idx === 0) {
          return {
            slotIndex: 0,
            team,
            userId,
            username: txRes.username,
            isBot: false,
            totalValue: 0,
            drops: [],
          };
        }
        return {
          slotIndex: idx,
          team,
          userId: null,
          username: null,
          isBot: false,
          totalValue: 0,
          drops: [],
        };
      });

      const battle: InternalBattle = {
        id: battleId,
        creatorUserId: userId,
        mode: payload.mode,
        isTeamMode: cfg.isTeamMode,
        maxPlayers: cfg.maxPlayers,
        reverseMode: Boolean(payload.reverseMode),
        fastMode: Boolean(payload.fastMode),
        status: 'WAITING',
        totalCost,
        loadedCases,
        slots,
        currentRoundIndex: -1,
        activeRoundSpin: null,
        winnerTeam: null,
        winnerSlotIndices: [],
        totalPotValue: 0,
        payoutPerWinner: 0,
        serverSeed,
        serverSeedHash: sha256Hex(serverSeed),
        publicSeed: `castino-battle-${battleId}`,
        createdAt: new Date().toISOString(),
        allRoundSpins: [],
      };

      this.battles.set(battleId, battle);
      emitBalanceUpdate(userId, txRes.newBalance, 'CASE_BATTLE_CREATE');
      this.broadcastListAndBattle(battle);

      // Nettoyer les vieilles battles terminées si > 40 en mémoire
      if (this.battles.size > 40) {
        const finished = Array.from(this.battles.values())
          .filter((b) => b.status === 'FINISHED')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        if (finished.length > 0) this.battles.delete(finished[0].id);
      }

      return { ok: true, battleId, newBalance: txRes.newBalance };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
        return { ok: false, error: 'Solde insuffisant pour créer cette Case Battle.' };
      }
      console.error('Create battle error:', err);
      return { ok: false, error: 'Erreur lors de la création de la battle.' };
    }
  }

  async joinBattle(
    userId: string,
    battleId: string,
    preferredSlot?: number
  ): Promise<{ ok: boolean; error?: string; newBalance?: number }> {
    const battle = this.battles.get(battleId);
    if (!battle) return { ok: false, error: 'Battle introuvable.' };
    if (battle.status !== 'WAITING') return { ok: false, error: 'Cette battle a déjà commencé.' };
    if (battle.slots.some((s) => s.userId === userId)) {
      return { ok: false, error: 'Vous participez déjà à cette battle.' };
    }

    let targetSlot =
      preferredSlot !== undefined
        ? battle.slots.find((s) => s.slotIndex === preferredSlot && !s.userId)
        : undefined;
    if (!targetSlot) {
      targetSlot = battle.slots.find((s) => !s.userId);
    }
    if (!targetSlot) return { ok: false, error: 'Toutes les places sont déjà prises.' };

    try {
      const txRes = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('USER_NOT_FOUND');
        if (user.balance < battle.totalCost) throw new Error('INSUFFICIENT_BALANCE');

        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            balance: { decrement: battle.totalCost },
            totalWagered: { increment: battle.totalCost },
          },
        });
        return { username: user.username, newBalance: updated.balance };
      });

      targetSlot.userId = userId;
      targetSlot.username = txRes.username;
      targetSlot.isBot = false;

      emitBalanceUpdate(userId, txRes.newBalance, 'CASE_BATTLE_JOIN');

      const allFilled = battle.slots.every((s) => s.userId !== null);
      if (allFilled) {
        this.startBattle(battle);
      } else {
        this.broadcastListAndBattle(battle);
      }

      return { ok: true, newBalance: txRes.newBalance };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
        return { ok: false, error: 'Solde insuffisant pour rejoindre cette battle.' };
      }
      console.error('Join battle error:', err);
      return { ok: false, error: 'Impossible de rejoindre la battle.' };
    }
  }

  callBots(userId: string, battleId: string): { ok: boolean; error?: string } {
    const battle = this.battles.get(battleId);
    if (!battle) return { ok: false, error: 'Battle introuvable.' };
    if (battle.status !== 'WAITING') return { ok: false, error: 'La battle est déjà en cours.' };
    if (battle.creatorUserId !== userId) {
      return { ok: false, error: 'Seul le créateur de la battle peut appeler des bots.' };
    }

    const shuffledBots = [...BATTLE_BOT_NAMES].sort(() => Math.random() - 0.5);
    let botIdx = 0;

    for (const slot of battle.slots) {
      if (!slot.userId) {
        const botName = shuffledBots[botIdx % shuffledBots.length];
        botIdx++;
        slot.userId = `bot:${battle.id}:${slot.slotIndex}`;
        slot.username = botName;
        slot.isBot = true;
      }
    }

    this.startBattle(battle);
    return { ok: true };
  }

  private startBattle(battle: InternalBattle): void {
    battle.status = 'RUNNING';
    battle.currentRoundIndex = 0;

    // Pré-calculer tous les tirages Provably Fair pour chaque manche et chaque joueur
    battle.allRoundSpins = battle.loadedCases.map((lc, roundIdx) => {
      const spins = battle.slots.map((slot) => {
        const nonce = roundIdx * 10 + slot.slotIndex;
        const rollTicket = rollCaseTicket(battle.serverSeed, battle.publicSeed, nonce);
        const hit =
          lc.items.find((e) => rollTicket >= e.ticketStart && rollTicket <= e.ticketEnd) ||
          lc.items[0];
        const winningIndex = 24;
        const reelItems = buildBattleReel(lc.items, hit.item, winningIndex);

        return {
          slotIndex: slot.slotIndex,
          wonItem: hit.item,
          rollTicket,
          reelItems,
          winningIndex,
        };
      });

      return {
        roundIndex: roundIdx,
        caseSummary: lc.summary,
        spins,
      };
    });

    this.runRound(battle, 0);
  }

  private runRound(battle: InternalBattle, roundIdx: number): void {
    const roundSpin = battle.allRoundSpins[roundIdx];
    if (!roundSpin) {
      void this.finishBattle(battle);
      return;
    }

    battle.currentRoundIndex = roundIdx;
    battle.activeRoundSpin = roundSpin;
    this.broadcastListAndBattle(battle);

    const spinRevealMs = battle.fastMode ? 1250 : 4100;
    const pauseAfterRevealMs = battle.fastMode ? 650 : 1200;

    // Appliquer les drops à la fin de l'animation de la manche
    setTimeout(() => {
      for (const spin of roundSpin.spins) {
        const slot = battle.slots[spin.slotIndex];
        slot.drops.push(spin.wonItem);
        slot.totalValue += spin.wonItem.value;
      }
      battle.totalPotValue = battle.slots.reduce((sum, s) => sum + s.totalValue, 0);
      this.broadcastListAndBattle(battle);

      setTimeout(() => {
        if (roundIdx + 1 < battle.allRoundSpins.length) {
          this.runRound(battle, roundIdx + 1);
        } else {
          void this.finishBattle(battle);
        }
      }, pauseAfterRevealMs);
    }, spinRevealMs);
  }

  private async finishBattle(battle: InternalBattle): Promise<void> {
    battle.status = 'FINISHED';
    battle.activeRoundSpin = null;

    // Calculer les scores par équipe (en solo, chaque joueur est sa propre "équipe")
    const teamTotals = new Map<number, number>();
    for (const slot of battle.slots) {
      teamTotals.set(slot.team, (teamTotals.get(slot.team) || 0) + slot.totalValue);
    }

    const entries = Array.from(teamTotals.entries());
    const targetScore = battle.reverseMode
      ? Math.min(...entries.map(([, val]) => val))
      : Math.max(...entries.map(([, val]) => val));

    // En cas d'égalité parfaite, départage Provably Fair sur les équipes ex-æquo
    const tiedTeams = entries.filter(([, val]) => val === targetScore).map(([t]) => t);
    const winnerTeam =
      tiedTeams.length === 1
        ? tiedTeams[0]
        : tiedTeams[rollCaseTicket(battle.serverSeed, battle.publicSeed, 999) % tiedTeams.length];

    battle.winnerTeam = winnerTeam;
    const winningSlots = battle.slots.filter((s) => s.team === winnerTeam);
    battle.winnerSlotIndices = winningSlots.map((s) => s.slotIndex);
    battle.totalPotValue = battle.slots.reduce((sum, s) => sum + s.totalValue, 0);
    battle.payoutPerWinner = Math.floor(battle.totalPotValue / winningSlots.length);

    // Créditer les vrais joueurs gagnants et enregistrer BetHistory pour tous les participants réels
    const realSlots = battle.slots.filter((s) => s.userId && !s.isBot);
    const allDroppedItems = battle.slots.flatMap((s) => s.drops);

    for (const slot of realSlots) {
      const uid = slot.userId!;
      const isWinner = slot.team === winnerTeam;
      const payout = isWinner ? battle.payoutPerWinner : 0;
      const profit = payout - battle.totalCost;
      const mult = battle.totalCost > 0 ? Math.round((payout / battle.totalCost) * 100) / 100 : 0;

      try {
        const txOut = await prisma.$transaction(async (tx) => {
          const bet = await tx.betHistory.create({
            data: {
              userId: uid,
              gameType: 'CASE_BATTLE',
              status: isWinner ? 'WON' : 'LOST',
              wager: battle.totalCost,
              multiplier: isWinner ? mult : 0,
              payout,
              profit,
              gameData: JSON.stringify({
                battleId: battle.id,
                mode: battle.mode,
                reverseMode: battle.reverseMode,
                totalPotValue: battle.totalPotValue,
                won: isWinner,
              }),
            },
          });

          if (isWinner) {
            const updatedUser = await tx.user.update({
              where: { id: uid },
              data: {
                balance: { increment: payout },
                totalWon: { increment: payout },
              },
            });
            return { betId: bet.id, newBalance: updatedUser.balance };
          }
          return { betId: bet.id, newBalance: null };
        });

        if (isWinner && txOut.newBalance !== null) {
          emitBalanceUpdate(uid, txOut.newBalance, 'CASE_BATTLE_WIN');

          // Best skin for feed thumbnail
          const bestItem = [...allDroppedItems].sort((a, b) => b.value - a.value)[0];
          broadcastFeedEvent({
            id: txOut.betId,
            type: 'CASINO_WIN',
            username: slot.username || 'Joueur',
            isBot: false,
            gameType: 'CASE_BATTLE',
            title: `Case Battle ${battle.mode}${battle.reverseMode ? ' Reverse' : ''}`,
            subtitle: `Pot remporté (${mult.toFixed(2)}×)`,
            amount: payout,
            multiplier: mult,
            rarity: bestItem?.rarity,
            imageUrl: bestItem?.imageUrl,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Case Battle settlement error for user', uid, err);
      }
    }

    this.broadcastListAndBattle(battle);
  }
}

export const battlesEngine = new BattlesEngine();
