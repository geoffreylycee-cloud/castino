import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Gem, Shuffle, Trash2 } from 'lucide-react';
import {
  KENO_PAYOUTS,
  formatCredits,
  type KenoPlayResponse,
  type KenoRisk,
} from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

export const KenoPage: React.FC = () => {
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(200);
  const [risk, setRisk] = useState<KenoRisk>('MEDIUM');
  const [selected, setSelected] = useState<number[]>([3, 7, 14, 21, 28, 35]);
  const [lastResult, setLastResult] = useState<KenoPlayResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleNumber = (n: number) => {
    if (busy) return;
    sound.click();
    setLastResult(null);
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 10) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const handleAutoPick = () => {
    sound.click();
    setLastResult(null);
    const pool = Array.from({ length: 40 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    setSelected(pool.slice(0, 6).sort((a, b) => a - b));
  };

  const handlePlay = async () => {
    if (busy || selected.length === 0) return;
    setBusy(true);
    try {
      const res = await apiFetch<KenoPlayResponse>('/api/games/keno/play', {
        method: 'POST',
        body: JSON.stringify({ wager, risk, selectedNumbers: selected }),
      });
      setLastResult(res);
      setBalance(res.newBalance);
      if (res.multiplier >= 1) {
        sound.win();
      } else {
        sound.tick();
      }
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur Keno', 'error');
    } finally {
      setBusy(false);
    }
  };

  const payoutRow = selected.length > 0 ? KENO_PAYOUTS[risk][selected.length] : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Contrôles Gauche */}
      <div className="lg:col-span-4 bg-[#213743] border border-[#2f4553] rounded-2xl p-5 space-y-5 h-fit">
        <WagerInput wagerCents={wager} onChange={setWager} disabled={busy} />

        <div>
          <label className="block text-xs font-semibold text-stake-muted mb-1.5">Risque</label>
          <div className="grid grid-cols-3 gap-2">
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRisk(r)}
                className={`py-2 rounded-lg text-xs font-extrabold border transition ${
                  risk === r
                    ? 'bg-[#00e701]/20 border-[#00e701] text-[#00e701]'
                    : 'bg-[#0f1923] border-[#2f4553] text-stake-muted hover:text-white'
                }`}
              >
                {r === 'LOW' ? 'Faible' : r === 'MEDIUM' ? 'Moyen' : 'Élevé'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleAutoPick}
            className="py-2.5 rounded-xl bg-[#2f4553] hover:bg-[#3d5a6c] text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Auto Pick</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected([]);
              setLastResult(null);
            }}
            className="py-2.5 rounded-xl bg-[#0f1923] hover:bg-[#1a2c38] border border-[#2f4553] text-xs font-bold flex items-center justify-center gap-1.5 text-stake-muted hover:text-white transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Effacer ({selected.length}/10)</span>
          </button>
        </div>

        <button
          onClick={handlePlay}
          disabled={busy || selected.length === 0}
          className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-base shadow-neon transition disabled:opacity-40"
        >
          {busy ? 'Tirage...' : 'Jouer'}
        </button>

        {lastResult && (
          <div className="bg-[#0f1923] border border-[#2f4553] rounded-xl p-3.5 text-center">
            <div className="text-xs text-stake-muted">
              {lastResult.hits.length} / {lastResult.selectedNumbers.length} bons numéros
            </div>
            <div
              className={`font-mono text-2xl font-black mt-0.5 ${
                lastResult.multiplier >= 1 ? 'text-[#00e701]' : 'text-slate-400'
              }`}
            >
              {lastResult.multiplier}× · +{formatCredits(lastResult.payout)} cr
            </div>
          </div>
        )}
      </div>

      {/* Grille 8x5 (40 cases) Droite */}
      <div className="lg:col-span-8 bg-[#0f1923] border-2 border-[#213743] rounded-2xl p-5 sm:p-8 flex flex-col justify-between space-y-6">
        <div className="grid grid-cols-5 sm:grid-cols-8 gap-2.5">
          {Array.from({ length: 40 }, (_, i) => i + 1).map((num) => {
            const isSelected = selected.includes(num);
            const isDrawn = lastResult?.drawnNumbers.includes(num) ?? false;
            const isHit = isSelected && isDrawn;

            return (
              <motion.button
                key={num}
                whileTap={{ scale: 0.92 }}
                onClick={() => toggleNumber(num)}
                className={`aspect-square rounded-xl font-mono text-sm sm:text-base font-black flex flex-col items-center justify-center border-b-4 transition ${
                  isHit
                    ? 'bg-[#00e701] text-[#071824] border-emerald-700 shadow-neon'
                    : isSelected
                    ? 'bg-purple-600 text-white border-purple-900'
                    : isDrawn
                    ? 'bg-[#071824] text-red-400 border-red-500/60'
                    : 'bg-[#213743] hover:bg-[#2f4553] text-white border-[#14232b]'
                }`}
              >
                {isHit ? <Gem className="w-5 h-5" /> : <span>{num}</span>}
              </motion.button>
            );
          })}
        </div>

        {/* Table des multiplicateurs Stake en bas */}
        {payoutRow.length > 0 && (
          <div className="grid grid-flow-col auto-cols-fr gap-1.5 overflow-x-auto pt-2">
            {payoutRow.map((mult, hitsCount) => {
              const isCurrentHit = lastResult && lastResult.hits.length === hitsCount;
              return (
                <div
                  key={hitsCount}
                  className={`rounded-lg py-2 px-1 text-center border transition ${
                    isCurrentHit
                      ? 'bg-[#00e701] text-[#071824] border-white font-black'
                      : 'bg-[#213743] text-white border-[#2f4553]'
                  }`}
                >
                  <div className="font-mono text-[11px] font-black">{mult}×</div>
                  <div
                    className={`text-[10px] font-semibold ${
                      isCurrentHit ? 'text-[#071824]' : 'text-stake-muted'
                    }`}
                  >
                    {hitsCount}★
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
