import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ChatMessageDTO,
  ClientToServerEvents,
  GameType,
  ItemRarity,
  ServerToClientEvents,
} from '@castino/shared';
import { ENV } from '../config/env.js';
import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { battlesEngine } from './battles.engine.js';
import { crashEngine } from './crash.engine.js';
import { rainEngine } from './rain.engine.js';
import { rouletteEngine } from './roulette.engine.js';
import {
  broadcastFeedEvent,
  getRecentFeedEvents,
  markUserOffline,
  markUserOnline,
  setSocketServer,
} from './hub.js';

async function hydrateRealFeedHistory(): Promise<void> {
  const recentBets = await prisma.betHistory.findMany({
    where: {
      OR: [
        { gameType: 'CASE_OPENING' },
        { status: 'WON', multiplier: { gte: 1.5 } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      user: { select: { username: true } },
      inventoryDrop: {
        include: {
          item: true,
          originCase: { select: { name: true } },
        },
      },
    },
  });

  // Charger dans l'ordre chronologique inverse pour que les plus récents soient en haut
  for (const bet of recentBets.reverse()) {
    if (bet.gameType === 'CASE_OPENING' && bet.inventoryDrop?.item) {
      const it = bet.inventoryDrop.item;
      broadcastFeedEvent({
        id: bet.id,
        type: 'CASE_DROP',
        username: bet.user.username,
        isBot: false,
        gameType: 'CASE_OPENING',
        title: `${it.weaponOrCategory ? it.weaponOrCategory + ' | ' : ''}${it.name}`,
        subtitle: bet.inventoryDrop.originCase?.name || 'CS2 Case',
        amount: it.value,
        multiplier: bet.multiplier,
        rarity: it.rarity as ItemRarity,
        imageUrl: it.imageUrl,
        createdAt: bet.createdAt.toISOString(),
      });
    } else if (bet.payout > 0) {
      broadcastFeedEvent({
        id: bet.id,
        type: 'CASINO_WIN',
        username: bet.user.username,
        isBot: false,
        gameType: bet.gameType as GameType,
        title: `${bet.gameType} Originals`,
        subtitle: `Gain ${bet.multiplier.toFixed(2)}×`,
        amount: bet.payout,
        multiplier: bet.multiplier,
        createdAt: bet.createdAt.toISOString(),
      });
    }
  }
}

export async function setupSocketServer(httpServer: HttpServer): Promise<void> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: ENV.CLIENT_ORIGIN === '*' ? true : ENV.CLIENT_ORIGIN.split(','),
      credentials: true,
    },
  });

  setSocketServer(io);

  await crashEngine.init();
  rouletteEngine.init();
  rainEngine.init();
  await hydrateRealFeedHistory();

  const broadcastOnlineCount = () => {
    io.emit('server:online_count', Math.max(1, io.engine.clientsCount));
  };

  io.on('connection', async (socket) => {
    const token =
      typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
    const authUser = token ? verifyToken(token) : null;

    if (authUser) {
      socket.join(`user:${authUser.userId}`);
      markUserOnline(authUser.userId);
    }

    broadcastOnlineCount();

    // Envoi de l'état initial 100% réel (Live Drops joueurs, Crash en cours, Battles, Chat global)
    socket.emit('feed:history', getRecentFeedEvents());
    socket.emit('crash:snapshot', crashEngine.getSnapshot());
    socket.emit('roulette:snapshot', rouletteEngine.getSnapshot());
    socket.emit('rain:snapshot', rainEngine.getSnapshot());
    socket.emit('battles:list', battlesEngine.getList());

    const recentMessages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 35,
      include: { user: { select: { id: true, username: true, isGuest: true } } },
    });

    const formattedChat: ChatMessageDTO[] = recentMessages.reverse().map((m) => ({
      id: m.id,
      userId: m.user.id,
      username: m.user.username,
      isGuest: m.user.isGuest,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    }));
    socket.emit('chat:history', formattedChat);

    socket.on('crash:request_snapshot', () => {
      socket.emit('crash:snapshot', crashEngine.getSnapshot());
    });

    socket.on('crash:place_bet', async (payload, ack) => {
      if (!authUser) {
        ack({ ok: false, error: 'Connectez-vous pour miser sur Crash.' });
        return;
      }
      const res = await crashEngine.placeBet(
        authUser.userId,
        payload.wager,
        payload.autoCashoutAt
      );
      ack(res);
    });

    socket.on('crash:cashout', async (ack) => {
      if (!authUser) {
        ack({ ok: false, error: 'Non authentifié.' });
        return;
      }
      const res = await crashEngine.cashoutPlayer(authUser.userId);
      ack(res);
    });

    // === CASE BATTLES ===
    socket.on('battles:request_list', () => {
      socket.emit('battles:list', battlesEngine.getList());
    });

    socket.on('battles:create', async (payload, ack) => {
      if (!authUser) {
        ack({ ok: false, error: 'Connectez-vous pour créer une Case Battle.' });
        return;
      }
      const res = await battlesEngine.createBattle(authUser.userId, payload);
      ack(res);
    });

    socket.on('battles:join', async (payload, ack) => {
      if (!authUser) {
        ack({ ok: false, error: 'Connectez-vous pour rejoindre une Case Battle.' });
        return;
      }
      const res = await battlesEngine.joinBattle(
        authUser.userId,
        payload.battleId,
        payload.slotIndex
      );
      ack(res);
    });

    socket.on('battles:call_bots', (payload, ack) => {
      if (!authUser) {
        ack({ ok: false, error: 'Non authentifié.' });
        return;
      }
      const res = battlesEngine.callBots(authUser.userId, payload.battleId);
      ack(res);
    });

    // === ROULETTE LIVE ===
    socket.on('roulette:request_snapshot', () => {
      socket.emit('roulette:snapshot', rouletteEngine.getSnapshot());
    });

    socket.on('roulette:place_bet', async (payload, ack) => {
      if (!authUser) {
        ack({ ok: false, error: 'Connectez-vous pour miser sur la Roulette Live.' });
        return;
      }
      const res = await rouletteEngine.placeBet(authUser.userId, payload);
      ack(res);
    });

    // === CHAT RAIN ===
    socket.on('rain:request_snapshot', () => {
      socket.emit('rain:snapshot', rainEngine.getSnapshot());
    });

    socket.on('rain:join', async (ack) => {
      if (!authUser) {
        ack({ ok: false, error: 'Connectez-vous pour rejoindre la Rain.' });
        return;
      }
      const res = await rainEngine.joinRain(authUser.userId);
      ack(res);
    });

    socket.on('rain:tip', async (payload, ack) => {
      if (!authUser) {
        ack({ ok: false, error: 'Connectez-vous pour ajouter au pot.' });
        return;
      }
      const res = await rainEngine.tipRain(authUser.userId, payload.amountCents);
      ack(res);
    });

    socket.on('chat:send', async (payload, ack) => {
      if (!authUser) {
        ack?.({ ok: false, error: 'Connectez-vous pour écrire dans le chat.' });
        return;
      }
      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      if (!text || text.length > 220) {
        ack?.({ ok: false, error: 'Message vide ou trop long (max 220 caractères).' });
        return;
      }

      try {
        const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
        if (!user) {
          ack?.({ ok: false, error: 'Utilisateur introuvable.' });
          return;
        }

        const saved = await prisma.chatMessage.create({
          data: {
            userId: user.id,
            text,
          },
        });

        const msgDTO: ChatMessageDTO = {
          id: saved.id,
          userId: user.id,
          username: user.username,
          isGuest: user.isGuest,
          text: saved.text,
          createdAt: saved.createdAt.toISOString(),
        };

        io.emit('chat:message', msgDTO);
        ack?.({ ok: true });
      } catch (err) {
        console.error('Chat send error:', err);
        ack?.({ ok: false, error: "Erreur lors de l'envoi." });
      }
    });

    socket.on('disconnect', () => {
      if (authUser) {
        markUserOffline(authUser.userId);
      }
      broadcastOnlineCount();
    });
  });
}
