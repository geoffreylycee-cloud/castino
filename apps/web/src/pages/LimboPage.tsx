import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { formatCredits, type LimboBetResponse } from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

export const LimboPage: React.FC = () => {
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(200);
  const [target, setTarget] = useState(2.0);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<LimboBetResponse | null>(null);
  const [history, setHistory] = useState<{ id: string; mult: number; won: boolean }[]>([]);

  const safeTarget = Math.max(1.01, Math.min(100000, Number.isNaN(target) ? 2 : target));
  const winChance = +(99 / safeTarget).toFixed(4);
  const profitOnWin = Math.max(0, Math.round(wager * safeTarget) - wager);

  const handlePlay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<LimboBetResponse>('/api/games/limbo/bet', {
        method: 'POST',
        body: JSON.stringify({ wager, targetMultiplier: safeTarget }),
      });
      setBalance(res.newBalance);
      setLastResult(res);
      setHistory((prev) =>
        [{ id: res.betId, mult: res.resultMultiplier, won: res.won }, ...prev].slice(0, 12)
      );
      if (res.won) {
        sound.win();
      } else {
        sound.tick();
      }
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur Limbo', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Contrôles Gauche */}
      <div className="lg:col-span-4 bg-[#213743] border border-[#2f4553] rounded-2xl p-5 space-y-5 h-fit">
        <WagerInput wagerCents={wager} onChange={setWager} disabled={busy} />

        <div>
          <label className="block text-xs font-semibold text-stake-muted mb-1.5">
            Profit en cas de victoire
          </label>
          <div className="bg-[#0f1923] border-2 border-[#2f4553] rounded-lg px-3.5 py-2.5 font-mono text-sm font-bold text-[#00e701]">
            +{formatCredits(profitOnWin)} cr
          </div>
        </div>

        <button
          onClick={handlePlay}
          disabled={busy}
          className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-base shadow-neon transition disabled:opacity-50"
        >
          {busy ? 'Lancer...' : 'Jouer'}
        </button>

        <div className="grid grid-cols-4 gap-1.5">
          {[1.5, 2, 5, 10].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTarget(preset)}
              className="py-1.5 rounded-lg bg-[#0f1923] hover:bg-[#1a2c38] border border-[#2f4553] font-mono text-xs font-bold text-stake-muted hover:text-white transition"
            >
              {preset}×
            </button>
          ))}
        </div>
      </div>

      {/* Arène Limbo Droite */}
      <div className="lg:col-span-8 bg-[#0f1923] border-2 border-[#213743] rounded-2xl p-6 sm:p-10 flex flex-col justify-between min-h-[420px]">
        {/* Historique des multiplicateurs */}
        <div className="flex items-center justify-end gap-2 overflow-x-auto min-h-[32px]">
          {history.map((h) => (
            <span
              key={h.id}
              className={`px-3 py-1 rounded-full font-mono text-xs font-extrabold shrink-0 ${
                h.won
                  ? 'bg-[#00e701] text-[#071824]'
                  : 'bg-[#213743] text-slate-300 border border-[#2f4553]'
              }`}
            >
              {h.mult.toFixed(2)}×
            </span>
          ))}
        </div>

        {/* Multiplicateur géant central */}
        <div className="my-10 flex flex-col items-center justify-center">
          <motion.div
            key={lastResult?.betId || 'init'}
            initial={{ scale: 0.72, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className={`font-mono text-6xl sm:text-8xl font-black tracking-tight ${
              !lastResult
                ? 'text-white'
                : lastResult.won
                ? 'text-[#00e701] drop-shadow-[0_0_24px_rgba(0,231,1,0.45)]'
                : 'text-red-500'
            }`}
          >
            {(lastResult?.resultMultiplier ?? 1.0).toFixed(2)}×
          </motion.div>
          {lastResult && (
            <div className="mt-3 text-xs font-bold text-stake-muted">
              {lastResult.won
                ? `Gagné ! +${formatCredits(lastResult.payout)} crédits`
                : `Cible ${lastResult.targetMultiplier.toFixed(2)}× non atteinte`}
            </div>
          )}
        </div>

        {/* Barre inférieure Cible / Chance de Gain */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#213743] border border-[#2f4553] rounded-xl p-4">
          <div>
            <label className="block text-[11px] font-bold text-stake-muted mb-1">
              Multiplicateur Cible (×)
            </label>
            <input
              type="number"
              step="0.1"
              min={1.01}
              max={100000}
              value={target}
              onChange={(e) => setTarget(parseFloat(e.target.value))}
              className="w-full bg-[#0f1923] border border-[#2f4553] focus:border-[#00e701] rounded-lg px-3.5 py-2.5 font-mono text-sm font-bold text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stake-muted mb-1">
              Chance de Gain
            </label>
            <div className="bg-[#0f1923] border border-[#2f4553] rounded-lg px-3.5 py-2.5 font-mono text-sm font-bold text-[#00e701]">
              {winChance.toFixed(2)} %
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
