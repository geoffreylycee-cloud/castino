import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';
import { CasesLobbyPage } from './pages/CasesLobbyPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { InventoryPage } from './pages/InventoryPage';
import { CrashPage } from './pages/CrashPage';
import { MinesPage } from './pages/MinesPage';
import { DicePage } from './pages/DicePage';
import { BlackjackPage } from './pages/BlackjackPage';
import { PlinkoPage } from './pages/PlinkoPage';
import { LimboPage } from './pages/LimboPage';
import { RoulettePage } from './pages/RoulettePage';
import { KenoPage } from './pages/KenoPage';
import { HiLoPage } from './pages/HiLoPage';
import { UpgraderPage } from './pages/UpgraderPage';
import { BattlesLobbyPage } from './pages/BattlesLobbyPage';
import { BattleRoomPage } from './pages/BattleRoomPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { AdminPage } from './pages/AdminPage';
import { useAuthStore } from './stores/useAuthStore';
import { useRealtimeStore } from './stores/useRealtimeStore';

export const App: React.FC = () => {
  const initAuth = useAuthStore((s) => s.initAuth);
  const bindSocketEvents = useRealtimeStore((s) => s.bindSocketEvents);

  useEffect(() => {
    bindSocketEvents();
    void initAuth();
  }, [bindSocketEvents, initAuth]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/cases" element={<CasesLobbyPage />} />
          <Route path="/cases/:slug" element={<CaseDetailPage />} />
          <Route path="/battles" element={<BattlesLobbyPage />} />
          <Route path="/battles/:id" element={<BattleRoomPage />} />
          <Route path="/upgrader" element={<UpgraderPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/games/crash" element={<CrashPage />} />
          <Route path="/games/mines" element={<MinesPage />} />
          <Route path="/games/dice" element={<DicePage />} />
          <Route path="/games/blackjack" element={<BlackjackPage />} />
          <Route path="/games/plinko" element={<PlinkoPage />} />
          <Route path="/games/limbo" element={<LimboPage />} />
          <Route path="/games/roulette" element={<RoulettePage />} />
          <Route path="/games/keno" element={<KenoPage />} />
          <Route path="/games/hilo" element={<HiLoPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
