import React, { useEffect, useState } from 'react';
import { Rocket, Users } from 'lucide-react';
import { crashMultiplierAtElapsedMs, formatCredits } from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { getSocket } from '../lib/socket';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useRealtimeStore } from '../stores/useRealtimeStore';
import { useUIStore } from '../stores/useUIStore';

export const CrashPage: React.FC = () => {
  const { user, setBalance } = useAuthStore();
  const { crashSnapshot, serverClockOffsetMs } = useRealtimeStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(500); // 5.00 cr
  const [autoCashout, setAutoCashout] = useState('2.00');
  const [displayMult, setDisplayMult] = useState(1.0);
  const [countdownSec, setCountdownSec] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSocket().emit('crash:request_snapshot');
  }, []);

  // Boucle 60 FPS fluide synchronisée sur l'horloge serveur
  useEffect(() => {
    let rafId = 0;

    const updateFrame = () => {
      if (crashSnapshot) {
        const estimatedServerNow = Date.now() + serverClockOffsetMs;
        if (crashSnapshot.status === 'WAITING' && crashSnapshot.waitingEndsAt) {
          const rem = Math.max(0, (crashSnapshot.waitingEndsAt - estimatedServerNow) / 1000);
          setCountdownSec(rem);
          setDisplayMult(1.0);
        } else if (crashSnapshot.status === 'RUNNING' && crashSnapshot.startedAt) {
          const elapsed = Math.max(0, estimatedServerNow - crashSnapshot.startedAt);
          setDisplayMult(crashMultiplierAtElapsedMs(elapsed));
        } else if (crashSnapshot.status === 'CRASHED') {
          setDisplayMult(crashSnapshot.crashPoint ?? crashSnapshot.currentMultiplier);
        }
      }
      rafId = requestAnimationFrame(updateFrame);
    };

    rafId = requestAnimationFrame(updateFrame);
    return () => cancelAnimationFrame(rafId);
  }, [crashSnapshot, serverClockOffsetMs]);

  useEffect(() => {
    if (crashSnapshot?.status === 'CRASHED') {
      sound.bust();
    }
  }, [crashSnapshot?.status, crashSnapshot?.roundId]);

  const myBet = crashSnapshot?.bets.find((b) => b.userId === user?.id);
  const canPlaceBet = crashSnapshot?.status === 'WAITING' && !myBet;
  const canCashout = crashSnapshot?.status === 'RUNNING' && myBet && !myBet.cashedOutAt;

  const handlePlaceBet = () => {
    if (busy || !canPlaceBet) return;
    setBusy(true);
    const parsedAuto = parseFloat(autoCashout);
    getSocket().emit(
      'crash:place_bet',
      {
        wager,
        autoCashoutAt: !Number.isNaN(parsedAuto) && parsedAuto >= 1.05 ? parsedAuto : null,
      },
      (res) => {
        setBusy(false);
        if (!res.ok) {
          pushToast(res.error || 'Mise refusée', 'error');
        } else {
          if (res.newBalance !== undefined) setBalance(res.newBalance);
          sound.click();
          pushToast('Mise engagée pour le décollage !', 'success');
        }
      }
    );
  };

  const handleCashout = () => {
    if (busy || !canCashout) return;
    setBusy(true);
    getSocket().emit('crash:cashout', (res) => {
      setBusy(false);
      if (!res.ok) {
        pushToast(res.error || 'Trop tard !', 'error');
      } else {
        if (res.newBalance !== undefined) setBalance(res.newBalance);
        sound.win();
        pushToast(
          `Cashout réussi à ${res.cashedOutAt?.toFixed(2)}× (+${formatCredits(res.payout || 0)} cr) !`,
          'success'
        );
      }
    });
  };

  // Génération de la courbe SVG dynamique
  const progress = Math.min(1, Math.log(Math.max(1, displayMult)) / Math.log(12));
  const endX = 40 + progress * 520;
  const endY = 250 - Math.pow(progress, 1.35) * 205;
  const pathD = `M 40 250 Q ${40 + (endX - 40) * 0.62} 250, ${endX} ${endY}`;
  const areaD = `${pathD} L ${endX} 250 Z`;

  return (
    <div className="space-y-4">
      {/* Historique des derniers multiplicateurs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(crashSnapshot?.history || []).map((h) => (
          <span
            key={h.roundNumber}
            className={`px-3 py-1 rounded-full font-mono text-xs font-extrabold shrink-0 border ${
              h.crashPoint >= 2
                ? 'bg-[#00e701]/15 border-[#00e701]/40 text-[#00e701]'
                : 'bg-[#213743] border-[#2f4553] text-slate-300'
            }`}
          >
            {h.crashPoint.toFixed(2)}×
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Panneau de Contrôle Gauche */}
        <div className="lg:col-span-4 bg-[#213743] border border-[#2f4553] rounded-2xl p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <WagerInput wagerCents={wager} onChange={setWager} disabled={!canPlaceBet} />

            <div>
              <label className="block text-xs font-semibold text-stake-muted mb-1.5">
                Auto Cashout (×)
              </label>
              <input
                type="number"
                step="0.1"
                min="1.05"
                disabled={!canPlaceBet}
                value={autoCashout}
                onChange={(e) => setAutoCashout(e.target.value)}
                className="w-full bg-[#0f1923] border-2 border-[#2f4553] focus:border-[#557086] rounded-lg px-3.5 py-2.5 font-mono text-sm font-bold text-white focus:outline-none disabled:opacity-50"
              />
            </div>

            {canCashout ? (
              <button
                onClick={handleCashout}
                disabled={busy}
                className="w-full py-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#071824] font-black text-base shadow-lg transition animate-pulse"
              >
                Encaisser {formatCredits(Math.round((myBet?.wager || 0) * displayMult))} cr (
                {displayMult.toFixed(2)}×)
              </button>
            ) : (
              <button
                onClick={handlePlaceBet}
                disabled={!canPlaceBet || busy}
                className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-sm sm:text-base shadow-neon transition disabled:opacity-45"
              >
                {myBet
                  ? myBet.cashedOutAt
                    ? `Encaissé à ${myBet.cashedOutAt.toFixed(2)}× !`
                    : 'Mise engagée !'
                  : crashSnapshot?.status === 'WAITING'
                  ? 'Placer la Mise (Prochain Round)'
                  : 'Manche en cours...'}
              </button>
            )}
          </div>

          {/* Liste des joueurs dans la manche */}
          <div className="border-t border-[#2f4553] pt-4">
            <div className="flex items-center justify-between text-xs font-bold text-stake-muted mb-2.5">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#00e701]" />
                Joueurs en lice ({crashSnapshot?.bets.length || 0})
              </span>
              <span>Round #{crashSnapshot?.roundNumber || 1}</span>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {(crashSnapshot?.bets || []).map((b) => (
                <div
                  key={b.betId}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0f1923] text-xs"
                >
                  <span className="font-semibold text-white truncate max-w-[110px]">
                    {b.username}
                  </span>
                  <span className="font-mono text-stake-muted">{formatCredits(b.wager)}</span>
                  {b.cashedOutAt ? (
                    <span className="font-mono font-extrabold text-[#00e701]">
                      {b.cashedOutAt.toFixed(2)}×
                    </span>
                  ) : crashSnapshot?.status === 'CRASHED' ? (
                    <span className="font-mono font-bold text-red-400">Crash</span>
                  ) : (
                    <span className="font-mono text-amber-300">En vol...</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Graphique Temps Réel Droite */}
        <div className="lg:col-span-8 bg-[#0f1923] border-2 border-[#213743] rounded-2xl p-6 relative flex flex-col justify-between min-h-[420px] overflow-hidden">
          <div className="flex items-center justify-between text-[11px] font-mono text-stake-muted z-10">
            <span>Synchronisé via Socket.io</span>
            <span className="truncate max-w-xs">
              Hash: {crashSnapshot?.serverSeedHash.slice(0, 20)}...
            </span>
          </div>

          {/* Affichage Central du Multiplicateur */}
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
            {crashSnapshot?.status === 'WAITING' ? (
              <div className="text-center space-y-2">
                <Rocket className="w-10 h-10 text-[#00e701] mx-auto animate-bounce" />
                <div className="text-sm font-bold text-stake-muted uppercase tracking-wider">
                  Décollage dans
                </div>
                <div className="font-mono text-5xl font-black text-white">
                  {countdownSec.toFixed(1)}s
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div
                  className={`font-mono text-6xl sm:text-7xl font-black tracking-tight ${
                    crashSnapshot?.status === 'CRASHED' ? 'text-red-500' : 'text-white'
                  }`}
                >
                  {displayMult.toFixed(2)}×
                </div>
                {crashSnapshot?.status === 'CRASHED' && (
                  <div className="mt-2 inline-block px-4 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-extrabold text-sm uppercase">
                    Crashed !
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Courbe SVG */}
          <svg viewBox="0 0 600 280" className="w-full h-72 mt-auto">
            <defs>
              <linearGradient id="crashArea" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={crashSnapshot?.status === 'CRASHED' ? '#ef4444' : '#00e701'}
                  stopOpacity="0.35"
                />
                <stop offset="100%" stopColor="#0f1923" stopOpacity="0" />
              </linearGradient>
            </defs>

            <line x1="40" y1="250" x2="570" y2="250" stroke="#213743" strokeWidth="2" />
            <line x1="40" y1="30" x2="40" y2="250" stroke="#213743" strokeWidth="2" />

            {crashSnapshot?.status !== 'WAITING' && (
              <>
                <path d={areaD} fill="url(#crashArea)" />
                <path
                  d={pathD}
                  fill="none"
                  stroke={crashSnapshot?.status === 'CRASHED' ? '#ef4444' : '#00e701'}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle
                  cx={endX}
                  cy={endY}
                  r="7"
                  fill={crashSnapshot?.status === 'CRASHED' ? '#ef4444' : '#ffffff'}
                />
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};
