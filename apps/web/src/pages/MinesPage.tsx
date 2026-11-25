import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bomb, Gem, Shuffle } from 'lucide-react';
import { formatCredits, type MinesActiveGameDTO } from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

export const MinesPage: React.FC = () => {
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(500);
  const [minesCount, setMinesCount] = useState(3);
  const [game, setGame] = useState<MinesActiveGameDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ game: MinesActiveGameDTO | null }>('/api/games/mines/active')
      .then((res) => {
        if (res.game) {
          setGame(res.game);
          setWager(res.game.wager);
          setMinesCount(res.game.minesCount);
        }
      })
      .catch(() => {});
  }, []);

  const isActive = game?.status === 'ACTIVE';

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ game: MinesActiveGameDTO; newBalance: number }>(
        '/api/games/mines/start',
        {
          method: 'POST',
          body: JSON.stringify({ wager, minesCount }),
        }
      );
      setGame(res.game);
      setBalance(res.newBalance);
      sound.click();
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur Mines', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async (tileIndex: number) => {
    if (!isActive || busy || game.revealedTiles.includes(tileIndex)) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ game: MinesActiveGameDTO; newBalance: number }>(
        '/api/games/mines/reveal',
        {
          method: 'POST',
          body: JSON.stringify({ tileIndex }),
        }
      );
      setGame(res.game);
      setBalance(res.newBalance);

      if (res.game.status === 'LOST') {
        sound.bust();
      } else if (res.game.status === 'WON') {
        sound.win();
        pushToast(
          `Grille complète ! +${formatCredits(res.game.currentPayout)} crédits !`,
          'success'
        );
      } else {
        sound.diamond(res.game.revealedTiles.length);
      }
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur révélation', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handlePickRandom = () => {
    if (!isActive || busy) return;
    const remaining = Array.from({ length: 25 }, (_, i) => i).filter(
      (idx) => !game.revealedTiles.includes(idx)
    );
    if (remaining.length === 0) return;
    const randomTile = remaining[Math.floor(Math.random() * remaining.length)];
    void handleReveal(randomTile);
  };

  const handleCashout = async () => {
    if (!isActive || busy || game.revealedTiles.length === 0) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ game: MinesActiveGameDTO; newBalance: number }>(
        '/api/games/mines/cashout',
        { method: 'POST' }
      );
      setGame(res.game);
      setBalance(res.newBalance);
      sound.win();
      pushToast(
        `Cashout ${res.game.currentMultiplier.toFixed(2)}× (+${formatCredits(
          res.game.currentPayout
        )} cr) !`,
        'success'
      );
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Cashout impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Contrôles Gauche */}
      <div className="lg:col-span-4 bg-[#213743] border border-[#2f4553] rounded-2xl p-5 space-y-5 h-fit">
        <WagerInput wagerCents={wager} onChange={setWager} disabled={isActive} />

        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-stake-muted mb-1.5">
            <span>Nombre de Mines</span>
            <span className="font-mono text-white">{25 - minesCount} diamants</span>
          </div>
          <select
            disabled={isActive}
            value={minesCount}
            onChange={(e) => setMinesCount(parseInt(e.target.value, 10))}
            className="w-full bg-[#0f1923] border-2 border-[#2f4553] rounded-lg px-3 py-2.5 text-sm font-bold text-white focus:outline-none disabled:opacity-50"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'Mine' : 'Mines'}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-5 gap-1.5 mt-2">
            {[1, 3, 5, 10, 20].map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={isActive}
                onClick={() => setMinesCount(preset)}
                className={`py-1.5 rounded text-xs font-bold border transition ${
                  minesCount === preset
                    ? 'bg-[#00e701]/20 border-[#00e701] text-[#00e701]'
                    : 'bg-[#0f1923] border-[#2f4553] text-stake-muted hover:text-white'
                } disabled:opacity-40`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {isActive && (
          <div className="bg-[#0f1923] border border-[#2f4553] rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-stake-muted">Multiplicateur actuel</span>
              <span className="font-mono font-bold text-white">
                {game.currentMultiplier.toFixed(2)}×
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stake-muted">Prochain diamant</span>
              <span className="font-mono font-bold text-[#00e701]">
                {game.nextMultiplier.toFixed(2)}×
              </span>
            </div>
          </div>
        )}

        {isActive ? (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handlePickRandom}
              disabled={busy}
              className="w-full py-3 rounded-xl bg-[#2f4553] hover:bg-[#3d5a6c] text-white font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <Shuffle className="w-4 h-4" />
              <span>Choisir une tuile au hasard</span>
            </button>

            <button
              type="button"
              onClick={handleCashout}
              disabled={busy || game.revealedTiles.length === 0}
              className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-sm sm:text-base shadow-neon transition disabled:opacity-40"
            >
              Cashout {formatCredits(game.currentPayout)} cr ({game.currentMultiplier.toFixed(2)}×)
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-base shadow-neon transition disabled:opacity-50"
          >
            Jouer
          </button>
        )}
      </div>

      {/* Grille 5x5 Droite */}
      <div className="lg:col-span-8 bg-[#0f1923] border-2 border-[#213743] rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center relative">
        <div className="grid grid-cols-5 gap-2.5 sm:gap-3.5 w-full max-w-[460px] aspect-square">
          {Array.from({ length: 25 }, (_, idx) => {
            const isRevealedSafe = game?.revealedTiles.includes(idx) ?? false;
            const isMine = game?.minePositions?.includes(idx) ?? false;
            const isHitMine = game?.hitMineIndex === idx;
            const gameEnded = game && game.status !== 'ACTIVE';

            return (
              <motion.button
                key={idx}
                whileHover={isActive && !isRevealedSafe ? { scale: 1.04 } : {}}
                whileTap={isActive && !isRevealedSafe ? { scale: 0.95 } : {}}
                disabled={!isActive || isRevealedSafe || busy}
                onClick={() => void handleReveal(idx)}
                className={`rounded-xl flex items-center justify-center border-b-4 transition-all ${
                  isRevealedSafe
                    ? 'bg-[#071824] border-[#00e701]/60 shadow-[inset_0_0_20px_rgba(0,231,1,0.18)]'
                    : isHitMine
                    ? 'bg-red-950 border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.45)]'
                    : gameEnded && isMine
                    ? 'bg-[#1a2c38] border-red-500/40 opacity-80'
                    : gameEnded
                    ? 'bg-[#1a2c38] border-[#213743] opacity-45'
                    : 'bg-[#213743] hover:bg-[#2f4553] border-[#14232b] cursor-pointer shadow-md'
                }`}
              >
                {isRevealedSafe && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <Gem className="w-7 h-7 sm:w-9 sm:h-9 text-[#00e701] drop-shadow-[0_0_10px_rgba(0,231,1,0.6)]" />
                  </motion.div>
                )}
                {gameEnded && isMine && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <Bomb
                      className={`w-7 h-7 sm:w-9 sm:h-9 ${
                        isHitMine ? 'text-red-500 animate-bounce' : 'text-red-400'
                      }`}
                    />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>

        {game?.status === 'WON' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 px-6 py-3 rounded-2xl bg-[#1a2c38] border-2 border-[#00e701] text-center shadow-neon"
          >
            <div className="font-mono text-2xl font-black text-[#00e701]">
              {game.currentMultiplier.toFixed(2)}×
            </div>
            <div className="font-mono text-xs font-bold text-white">
              +{formatCredits(game.currentPayout)} crédits
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
