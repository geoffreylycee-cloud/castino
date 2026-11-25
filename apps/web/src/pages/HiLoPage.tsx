import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, FastForward } from 'lucide-react';
import { formatCredits, type HiLoGuess, type HiLoStateDTO, type PlayingCard } from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

const SUITS: Record<PlayingCard['suit'], { symbol: string; red: boolean }> = {
  hearts: { symbol: '♥', red: true },
  diamonds: { symbol: '♦', red: true },
  spades: { symbol: '♠', red: false },
  clubs: { symbol: '♣', red: false },
};

export const HiLoPage: React.FC = () => {
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(500);
  const [game, setGame] = useState<HiLoStateDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ game: HiLoStateDTO | null }>('/api/games/hilo/active')
      .then((res) => {
        if (res.game) {
          setGame(res.game);
          setWager(res.game.wager);
        }
      })
      .catch(() => {});
  }, []);

  const isActive = game?.status === 'ACTIVE';

  const handleStart = async () => {
    if (busy || isActive) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ game: HiLoStateDTO }>('/api/games/hilo/start', {
        method: 'POST',
        body: JSON.stringify({ wager }),
      });
      setGame(res.game);
      if (res.game.newBalance !== undefined) setBalance(res.game.newBalance);
      sound.card();
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur HiLo', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleGuess = async (guess: HiLoGuess) => {
    if (busy || !isActive) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ game: HiLoStateDTO }>('/api/games/hilo/guess', {
        method: 'POST',
        body: JSON.stringify({ guess }),
      });
      setGame(res.game);
      if (res.game.status === 'LOST') {
        sound.bust();
      } else if (guess === 'SKIP') {
        sound.card();
      } else {
        sound.diamond(res.game.cards.length);
      }
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Action refusée', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCashout = async () => {
    if (busy || !isActive || game.currentMultiplier <= 1) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ game: HiLoStateDTO }>('/api/games/hilo/cashout', {
        method: 'POST',
      });
      setGame(res.game);
      if (res.game.newBalance !== undefined) setBalance(res.game.newBalance);
      sound.win();
      pushToast(
        `Cashout HiLo ${res.game.currentMultiplier.toFixed(2)}× (+${formatCredits(
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

  const activeCard = game?.currentCard;
  const activeSuit = activeCard ? SUITS[activeCard.suit] : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Contrôles Gauche */}
      <div className="lg:col-span-4 bg-[#213743] border border-[#2f4553] rounded-2xl p-5 space-y-4 h-fit">
        <WagerInput wagerCents={wager} onChange={setWager} disabled={isActive} />

        {isActive ? (
          <div className="space-y-2.5">
            <button
              onClick={() => void handleGuess('HIGHER')}
              disabled={busy}
              className="w-full py-3.5 px-4 rounded-xl bg-[#2f4553] hover:bg-[#3d5a6c] flex items-center justify-between text-xs font-extrabold transition"
            >
              <span className="flex items-center gap-2 text-amber-300">
                <ArrowUp className="w-4 h-4" />
                {game.odds.higherLabel}
              </span>
              <span className="font-mono text-white">
                {game.odds.higherMultiplier.toFixed(2)}× ({game.odds.higherChance}%)
              </span>
            </button>

            <button
              onClick={() => void handleGuess('LOWER')}
              disabled={busy}
              className="w-full py-3.5 px-4 rounded-xl bg-[#2f4553] hover:bg-[#3d5a6c] flex items-center justify-between text-xs font-extrabold transition"
            >
              <span className="flex items-center gap-2 text-sky-400">
                <ArrowDown className="w-4 h-4" />
                {game.odds.lowerLabel}
              </span>
              <span className="font-mono text-white">
                {game.odds.lowerMultiplier.toFixed(2)}× ({game.odds.lowerChance}%)
              </span>
            </button>

            <button
              onClick={() => void handleGuess('SKIP')}
              disabled={busy || game.skipsRemaining <= 0}
              className="w-full py-2.5 rounded-xl bg-[#0f1923] hover:bg-[#1a2c38] border border-[#2f4553] text-xs font-bold text-stake-muted hover:text-white flex items-center justify-center gap-1.5 transition disabled:opacity-40"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>Passer la carte ({game.skipsRemaining} restants)</span>
            </button>

            <button
              onClick={() => void handleCashout()}
              disabled={busy || game.currentMultiplier <= 1}
              className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-sm sm:text-base shadow-neon transition disabled:opacity-40"
            >
              Cashout {formatCredits(game.currentPayout)} cr ({game.currentMultiplier.toFixed(2)}×)
            </button>
          </div>
        ) : (
          <button
            onClick={handleStart}
            disabled={busy}
            className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-base shadow-neon transition disabled:opacity-50"
          >
            Démarrer une Série HiLo
          </button>
        )}
      </div>

      {/* Table HiLo Droite */}
      <div className="lg:col-span-8 bg-[#0f1923] border-2 border-[#213743] rounded-2xl p-6 sm:p-10 flex flex-col justify-between min-h-[450px]">
        <div className="flex items-center justify-between text-xs font-bold text-stake-muted">
          <span>As = Plus bas (1)</span>
          <span className="font-mono text-base font-black text-[#00e701]">
            {game ? `${game.currentMultiplier.toFixed(2)}×` : '1.00×'}
          </span>
          <span>Roi = Plus haut (13)</span>
        </div>

        {/* Carte Centrale */}
        <div className="my-8 flex flex-col items-center justify-center">
          {activeCard && activeSuit ? (
            <motion.div
              key={`${game.cards.length}-${activeCard.code}`}
              initial={{ scale: 0.78, rotateY: 75, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className={`w-36 h-52 rounded-2xl bg-white p-4 shadow-2xl border-4 flex flex-col justify-between select-none ${
                game.status === 'LOST'
                  ? 'border-red-500'
                  : game.status === 'WON'
                  ? 'border-[#00e701]'
                  : 'border-slate-200'
              }`}
            >
              <div className={`text-3xl font-black leading-none ${activeSuit.red ? 'text-red-600' : 'text-slate-900'}`}>
                <div>{activeCard.rank}</div>
                <div className="text-xl">{activeSuit.symbol}</div>
              </div>
              <div className={`text-6xl self-center ${activeSuit.red ? 'text-red-600' : 'text-slate-900'}`}>
                {activeSuit.symbol}
              </div>
              <div
                className={`text-2xl font-black self-end rotate-180 leading-none ${
                  activeSuit.red ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {activeCard.rank}
              </div>
            </motion.div>
          ) : (
            <div className="w-36 h-52 rounded-2xl bg-[#1a2c38] border-2 border-dashed border-[#2f4553] flex items-center justify-center text-xs text-stake-muted text-center px-4">
              Cliquez sur Démarrer pour tirer la première carte
            </div>
          )}
        </div>

        {/* Historique de la série en cours */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 min-h-[76px]">
          {(game?.cards || []).map((c, idx) => {
            const s = SUITS[c.suit];
            return (
              <div
                key={`${idx}-${c.code}`}
                className="shrink-0 w-12 h-16 rounded-lg bg-white p-1.5 flex flex-col justify-between shadow"
              >
                <span className={`text-xs font-black leading-none ${s.red ? 'text-red-600' : 'text-slate-900'}`}>
                  {c.rank}
                </span>
                <span className={`text-lg self-center leading-none ${s.red ? 'text-red-600' : 'text-slate-900'}`}>
                  {s.symbol}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
