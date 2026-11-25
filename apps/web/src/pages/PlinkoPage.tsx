import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  PLINKO_MULTIPLIERS,
  type PlinkoDropResponse,
  type PlinkoRisk,
  type PlinkoRows,
} from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

interface FallingBall {
  id: string;
  xs: number[];
  ys: number[];
  bucketIndex: number;
  multiplier: number;
}

export const PlinkoPage: React.FC = () => {
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(200);
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [risk, setRisk] = useState<PlinkoRisk>('MEDIUM');
  const [balls, setBalls] = useState<FallingBall[]>([]);
  const [activeBucket, setActiveBucket] = useState<number | null>(null);
  const [recentMults, setRecentMults] = useState<{ id: string; mult: number }[]>([]);

  const buckets = PLINKO_MULTIPLIERS[rows][risk];
  const hasActiveBalls = balls.length > 0;

  // Géométrie du plateau SVG (600 x 430)
  const topY = 36;
  const bottomY = 365;
  const rowGapY = (bottomY - topY) / rows;
  const pegGapX = 480 / (rows + 2);

  const handleDrop = async () => {
    try {
      const res = await apiFetch<PlinkoDropResponse>('/api/games/plinko/drop', {
        method: 'POST',
        body: JSON.stringify({ wager, rows, risk }),
      });

      const xs: number[] = [300];
      const ys: number[] = [14];
      let pos = 0; // décalage relatif
      res.directions.forEach((dir, rIdx) => {
        pos += dir === 1 ? 0.5 : -0.5;
        xs.push(300 + pos * pegGapX + (Math.random() - 0.5) * 4);
        ys.push(topY + (rIdx + 1) * rowGapY);
      });

      const ballId = res.betId;
      const newBall: FallingBall = {
        id: ballId,
        xs,
        ys,
        bucketIndex: res.bucketIndex,
        multiplier: res.multiplier,
      };

      setBalls((prev) => [...prev, newBall]);
      sound.peg();

      const durationMs = rows * 115;
      setTimeout(() => {
        setBalls((prev) => prev.filter((b) => b.id !== ballId));
        setActiveBucket(res.bucketIndex);
        setBalance(res.newBalance);
        setRecentMults((prev) => [{ id: ballId, mult: res.multiplier }, ...prev].slice(0, 8));
        if (res.multiplier >= 2) {
          sound.win();
        } else {
          sound.tick();
        }
      }, durationMs);
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur Plinko', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Contrôles Gauche */}
      <div className="lg:col-span-4 bg-[#213743] border border-[#2f4553] rounded-2xl p-5 space-y-5 h-fit">
        <WagerInput wagerCents={wager} onChange={setWager} />

        <div>
          <label className="block text-xs font-semibold text-stake-muted mb-1.5">
            Niveau de Risque
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map((r) => (
              <button
                key={r}
                disabled={hasActiveBalls}
                onClick={() => setRisk(r)}
                className={`py-2 rounded-lg text-xs font-extrabold border transition ${
                  risk === r
                    ? 'bg-[#00e701]/20 border-[#00e701] text-[#00e701]'
                    : 'bg-[#0f1923] border-[#2f4553] text-stake-muted hover:text-white'
                } disabled:opacity-40`}
              >
                {r === 'LOW' ? 'Faible' : r === 'MEDIUM' ? 'Moyen' : 'Élevé'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stake-muted mb-1.5">
            Nombre de Rangées
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([8, 12, 16] as const).map((r) => (
              <button
                key={r}
                disabled={hasActiveBalls}
                onClick={() => setRows(r)}
                className={`py-2 rounded-lg font-mono text-xs font-extrabold border transition ${
                  rows === r
                    ? 'bg-[#00e701]/20 border-[#00e701] text-[#00e701]'
                    : 'bg-[#0f1923] border-[#2f4553] text-stake-muted hover:text-white'
                } disabled:opacity-40`}
              >
                {r} lignes
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => void handleDrop()}
          className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-base shadow-neon transition active:scale-[0.99]"
        >
          Lâcher une Bille
        </button>
      </div>

      {/* Pyramide Plinko */}
      <div className="lg:col-span-8 bg-[#0f1923] border-2 border-[#213743] rounded-2xl p-4 sm:p-6 relative flex flex-col items-center justify-center">
        {/* Historique rapide latéral */}
        <div className="absolute top-4 right-4 flex flex-col gap-1.5 z-10">
          {recentMults.map((m) => (
            <span
              key={m.id}
              className={`px-2.5 py-1 rounded-lg font-mono text-xs font-extrabold text-center ${
                m.mult >= 2
                  ? 'bg-[#00e701] text-[#071824]'
                  : 'bg-[#213743] text-slate-300 border border-[#2f4553]'
              }`}
            >
              {m.mult}×
            </span>
          ))}
        </div>

        <svg viewBox="0 0 600 420" className="w-full max-w-[620px] select-none">
          {/* Quilles (Pegs) */}
          {Array.from({ length: rows }, (_, rIdx) => {
            const pegsInRow = rIdx + 3;
            const y = topY + rIdx * rowGapY;
            return Array.from({ length: pegsInRow }, (_, pIdx) => {
              const x = 300 + (pIdx - (pegsInRow - 1) / 2) * pegGapX;
              return <circle key={`${rIdx}-${pIdx}`} cx={x} cy={y} r={4.2} fill="#e2e8f0" />;
            });
          })}

          {/* Billes animées */}
          {balls.map((ball) => (
            <motion.circle
              key={ball.id}
              r={8}
              fill="#00e701"
              initial={{ cx: ball.xs[0], cy: ball.ys[0] }}
              animate={{ cx: ball.xs, cy: ball.ys }}
              transition={{ duration: (rows * 115) / 1000, ease: 'linear' }}
            />
          ))}

          {/* Paniers Multiplicateurs en bas */}
          {buckets.map((mult, bIdx) => {
            const x = 300 + (bIdx - (buckets.length - 1) / 2) * pegGapX;
            const w = Math.max(22, pegGapX - 4);
            const color =
              mult >= 15
                ? '#ef4444'
                : mult >= 3
                ? '#f97316'
                : mult >= 1.2
                ? '#eab308'
                : '#38bdf8';

            return (
              <g
                key={bIdx}
                transform={`translate(${x - w / 2}, ${bottomY + 14})`}
              >
                <rect
                  width={w}
                  height={26}
                  rx={5}
                  fill={color}
                  opacity={activeBucket === bIdx ? 1 : 0.85}
                  stroke={activeBucket === bIdx ? '#ffffff' : 'none'}
                  strokeWidth={2}
                />
                <text
                  x={w / 2}
                  y={17}
                  textAnchor="middle"
                  fill="#0f1923"
                  fontFamily="monospace"
                  fontSize={rows === 16 ? '8.5' : '10'}
                  fontWeight="900"
                >
                  {mult}×
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
