import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight } from 'lucide-react';
import { formatCredits, type DiceCondition, type DiceRollResponse } from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

export const DicePage: React.FC = () => {
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(200);
  const [target, setTarget] = useState(50.5);
  const [condition, setCondition] = useState<DiceCondition>('OVER');
  const [rolling, setRolling] = useState(false);
  const [lastRoll, setLastRoll] = useState<DiceRollResponse | null>(null);
  const [history, setHistory] = useState<{ id: string; roll: number; won: boolean }[]>([]);

  const winChance = +(condition === 'UNDER' ? target : 100 - target).toFixed(2);
  const multiplier = +(99 / winChance).toFixed(4);
  const profitOnWin = Math.max(0, Math.round(wager * multiplier) - wager);

  const handleRoll = async () => {
    if (rolling) return;
    setRolling(true);
    try {
      const res = await apiFetch<DiceRollResponse>('/api/games/dice/roll', {
        method: 'POST',
        body: JSON.stringify({ wager, target, condition }),
      });
      setBalance(res.newBalance);
      setLastRoll(res);
      setHistory((prev) => [{ id: res.betId, roll: res.roll, won: res.won }, ...prev].slice(0, 12));
      if (res.won) {
        sound.win();
      } else {
        sound.tick();
      }
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur Dice', 'error');
    } finally {
      setRolling(false);
    }
  };

  const toggleCondition = () => {
    sound.click();
    setCondition((c) => (c === 'OVER' ? 'UNDER' : 'OVER'));
    setTarget((t) => +(100 - t).toFixed(2));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Contrôles Gauche */}
      <div className="lg:col-span-4 bg-[#213743] border border-[#2f4553] rounded-2xl p-5 space-y-5 h-fit">
        <WagerInput wagerCents={wager} onChange={setWager} disabled={rolling} />

        <div>
          <label className="block text-xs font-semibold text-stake-muted mb-1.5">
            Profit en cas de victoire
          </label>
          <div className="bg-[#0f1923] border-2 border-[#2f4553] rounded-lg px-3.5 py-2.5 font-mono text-sm font-bold text-[#00e701]">
            +{formatCredits(profitOnWin)} cr
          </div>
        </div>

        <button
          onClick={handleRoll}
          disabled={rolling}
          className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-base shadow-neon transition disabled:opacity-50"
        >
          {rolling ? 'Lancer...' : 'Lancer le Dé'}
        </button>
      </div>

      {/* Piste Dice Style Stake */}
      <div className="lg:col-span-8 bg-[#0f1923] border-2 border-[#213743] rounded-2xl p-6 sm:p-10 flex flex-col justify-between min-h-[420px]">
        {/* Historique des derniers jets */}
        <div className="flex items-center justify-end gap-2 overflow-x-auto min-h-[32px]">
          {history.map((h) => (
            <span
              key={h.id}
              className={`px-3 py-1 rounded-full font-mono text-xs font-extrabold ${
                h.won
                  ? 'bg-[#00e701] text-[#071824]'
                  : 'bg-[#213743] text-slate-300 border border-[#2f4553]'
              }`}
            >
              {h.roll.toFixed(2)}
            </span>
          ))}
        </div>

        {/* Barre 0 - 100 avec marqueur animé */}
        <div className="my-12 px-2">
          <div className="flex justify-between text-xs font-mono font-bold text-stake-muted mb-3">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>

          <div className="relative h-14 bg-[#213743] rounded-full p-2.5 border-2 border-[#2f4553] flex items-center">
            {/* Piste colorée Rouge / Verte */}
            <div className="relative w-full h-4 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${target}%` }}
                className={condition === 'UNDER' ? 'bg-[#00e701]' : 'bg-red-500'}
              />
              <div
                style={{ width: `${100 - target}%` }}
                className={condition === 'OVER' ? 'bg-[#00e701]' : 'bg-red-500'}
              />
            </div>

            {/* Slider invisible superposé */}
            <input
              type="range"
              min={2}
              max={98}
              step={0.5}
              value={target}
              onChange={(e) => setTarget(parseFloat(e.target.value))}
              className="absolute inset-x-2.5 w-[calc(100%-20px)] h-10 opacity-0 cursor-ew-resize z-20"
            />

            {/* Poignée visuelle du seuil */}
            <div
              style={{ left: `calc(${target}% )` }}
              className="pointer-events-none absolute -translate-x-1/2 w-7 h-9 rounded-lg bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center z-10"
            >
              <div className="w-1 h-4 bg-white/80 rounded" />
            </div>

            {/* Cube du résultat tiré */}
            {lastRoll && (
              <motion.div
                key={lastRoll.betId}
                initial={{ scale: 0.7, y: -38 }}
                animate={{ left: `${lastRoll.roll}%`, scale: 1, y: -46 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                className={`pointer-events-none absolute -translate-x-1/2 px-3 py-1.5 rounded-xl font-mono text-sm font-black border-2 shadow-xl ${
                  lastRoll.won
                    ? 'bg-[#00e701] text-[#071824] border-white'
                    : 'bg-[#1a2c38] text-red-400 border-red-500'
                }`}
              >
                {lastRoll.roll.toFixed(2)}
              </motion.div>
            )}
          </div>
        </div>

        {/* Panneau inférieur Stake : Multiplicateur / Roll Over-Under / Chance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#213743] border border-[#2f4553] rounded-xl p-4">
          <div>
            <span className="block text-[11px] font-bold text-stake-muted mb-1">
              Multiplicateur
            </span>
            <div className="bg-[#0f1923] border border-[#2f4553] rounded-lg px-3 py-2 font-mono text-sm font-bold text-white">
              {multiplier.toFixed(4)}×
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-bold text-stake-muted mb-1">
              {condition === 'OVER' ? 'Roll Over (Supérieur à)' : 'Roll Under (Inférieur à)'}
            </span>
            <button
              type="button"
              onClick={toggleCondition}
              className="w-full bg-[#0f1923] hover:bg-[#162530] border border-[#2f4553] rounded-lg px-3 py-2 font-mono text-sm font-bold text-white flex items-center justify-between transition"
            >
              <span>{target.toFixed(2)}</span>
              <ArrowLeftRight className="w-4 h-4 text-[#00e701]" />
            </button>
          </div>

          <div>
            <span className="block text-[11px] font-bold text-stake-muted mb-1">
              Chance de Gain
            </span>
            <div className="bg-[#0f1923] border border-[#2f4553] rounded-lg px-3 py-2 font-mono text-sm font-bold text-[#00e701]">
              {winChance.toFixed(2)} %
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
