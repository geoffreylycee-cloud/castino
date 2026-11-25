import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { ENV } from './config/env.js';
import { adminRouter, ensureAdminAccount } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { casesRouter } from './modules/cases/cases.routes.js';
import { fairnessRouter } from './modules/fairness/fairness.service.js';
import { blackjackRouter } from './modules/games/blackjack.routes.js';
import { diceRouter } from './modules/games/dice.routes.js';
import { hiloRouter } from './modules/games/hilo.routes.js';
import { kenoRouter } from './modules/games/keno.routes.js';
import { limboRouter } from './modules/games/limbo.routes.js';
import { minesRouter } from './modules/games/mines.routes.js';
import { plinkoRouter } from './modules/games/plinko.routes.js';
import { rouletteRouter } from './modules/games/roulette.routes.js';
import { upgraderRouter } from './modules/games/upgrader.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { leaderboardRouter } from './modules/leaderboard/leaderboard.routes.js';
import { walletRouter } from './modules/wallet/wallet.routes.js';
import { setupSocketServer } from './socket/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(
    cors({
      origin: ENV.CLIENT_ORIGIN === '*' ? true : ENV.CLIENT_ORIGIN.split(','),
      credentials: true,
    })
  );
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'CaSTIno', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/fairness', fairnessRouter);
  app.use('/api/cases', casesRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/games/dice', diceRouter);
  app.use('/api/games/mines', minesRouter);
  app.use('/api/games/blackjack', blackjackRouter);
  app.use('/api/games/plinko', plinkoRouter);
  app.use('/api/games/limbo', limboRouter);
  app.use('/api/games/roulette', rouletteRouter);
  app.use('/api/games/keno', kenoRouter);
  app.use('/api/games/hilo', hiloRouter);
  app.use('/api/games/upgrader', upgraderRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/admin', adminRouter);

  // En production (ex: Render / Koyeb / Railway), servir le build statique de apps/web/dist
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        next();
        return;
      }
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  await ensureAdminAccount();
  await setupSocketServer(httpServer);

  httpServer.listen(ENV.PORT, '0.0.0.0', () => {
    console.log(`🚀 CaSTIno Server & Socket.io opérationnels sur http://localhost:${ENV.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
