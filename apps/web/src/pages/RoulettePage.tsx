import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Users } from 'lucide-react';
import {
  ROULETTE_WHEEL_ORDER,
  formatCredits,
  getRouletteColor,
  type LiveRouletteBetDTO,
  type RouletteBetKind,
} from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { getSocket } from '../lib/socket';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useRealtimeStore } from '../stores/useRealtimeStore';
import { useUIStore } from '../stores/useUIStore';

const TILE_W = 64;
const TILE_GAP = 6;
const TILE_STEP = TILE_W + TILE_GAP;

function formatBetLabel(b: { betKind: RouletteBetKind; betNumber?: number }): string {
  switch (b.betKind) {
    case 'NUMBER':
      return `#${b.betNumber} (36×)`;
    case 'GREEN':
      return '0 Vert (36×)';
    case 'RED':
      return 'Rouge (2×)';
    case 'BLACK':
      return 'Noir (2×)';
    case 'EVEN':
      return 'Pair (2×)';
    case 'ODD':
      return 'Impair (2×)';
    case 'LOW':
      return '1–18 (2×)';
    case 'HIGH':
      return '19–36 (2×)';
    case 'DOZEN_1':
      return '1–12 (3×)';
    case 'DOZEN_2':
      return '13–24 (3×)';
    case 'DOZEN_3':
      return '25–36 (3×)';
  }
}

export const RoulettePage: React.FC = () => {
  const { user, setBalance } = useAuthStore();
  const { rouletteSnapshot, serverClockOffsetMs } = useRealtimeStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(200);
  const [betKind, setBetKind] = useState<RouletteBetKind>('RED');
  const [betNumber, setBetNumber] = useState<number>(7);
  const [busy, setBusy] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);

  const [spinKey, setSpinKey] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [spinDuration, setSpinDuration] = useState(0);

  const stripViewportRef = useRef<HTMLDivElement | null>(null);
  const lastSpunRoundRef = useRef<number | null>(null);
  const lastResultRoundRef = useRef<number | null>(null);

  useEffect(() => {
    getSocket().emit('roulette:request_snapshot');
  }, []);

  const stripNumbers = useMemo(
    () => [
      ...ROULETTE_WHEEL_ORDER,
      ...ROULETTE_WHEEL_ORDER,
      ...ROULETTE_WHEEL_ORDER,
      ...ROULETTE_WHEEL_ORDER,
    ],
    []
  );

  // Compte à rebours fluide synchronisé sur l'horloge serveur
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      if (rouletteSnapshot?.status === 'BETTING' && rouletteSnapshot.bettingEndsAt) {
        const rem = Math.max(
          0,
          (rouletteSnapshot.bettingEndsAt - (Date.now() + serverClockOffsetMs)) / 1000
        );
        setCountdownSec(rem);
      } else {
        setCountdownSec(0);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [rouletteSnapshot, serverClockOffsetMs]);

  // Déclenchement synchronisé du rouleau quand le serveur passe en SPINNING
  useEffect(() => {
    if (
      !rouletteSnapshot ||
      rouletteSnapshot.status !== 'SPINNING' ||
      rouletteSnapshot.winningNumber === undefined
    ) {
      return;
    }
    if (lastSpunRoundRef.current === rouletteSnapshot.roundNumber) return;
    lastSpunRoundRef.current = rouletteSnapshot.roundNumber;

    const baseIndex = ROULETTE_WHEEL_ORDER.indexOf(rouletteSnapshot.winningNumber);
    const targetIndex = ROULETTE_WHEEL_ORDER.length * 2 + (baseIndex >= 0 ? baseIndex : 0);
    const viewportWidth = stripViewportRef.current?.clientWidth || 720;
    const finalX = -(targetIndex * TILE_STEP - viewportWidth / 2 + TILE_W / 2);

    const elapsedSec = rouletteSnapshot.spinStartedAt
      ? Math.max(0, (Date.now() + serverClockOffsetMs - rouletteSnapshot.spinStartedAt) / 1000)
      : 0;
    const remainingDuration = Math.max(0.4, 4.2 - elapsedSec);

    setSpinDuration(remainingDuration);
    setOffsetX(finalX);
    setSpinKey((k) => k + 1);

    [180, 420, 720, 1100, 1550, 2080, 2680, 3360].forEach((ms) => {
      if (ms < remainingDuration * 1000) {
        setTimeout(() => sound.tick(), ms);
      }
    });
  }, [rouletteSnapshot, serverClockOffsetMs]);

  // Notification sonore & toast à l'arrivée du RESULT
  useEffect(() => {
    if (!rouletteSnapshot || rouletteSnapshot.status !== 'RESULT') return;
    if (lastResultRoundRef.current === rouletteSnapshot.roundNumber) return;
    lastResultRoundRef.current = rouletteSnapshot.roundNumber;

    const myBets = rouletteSnapshot.bets.filter((b) => b.userId === user?.id);
    if (myBets.length > 0) {
      const totalWon = myBets.reduce((sum, b) => sum + (b.payout || 0), 0);
      if (totalWon > 0) {
        sound.win();
        pushToast(
          `Numéro ${rouletteSnapshot.winningNumber} ! Vous remportez +${formatCredits(totalWon)} $ !`,
          'success'
        );
      } else {
        sound.bust();
      }
    }
  }, [rouletteSnapshot, user?.id, pushToast]);

  const isBettingOpen = rouletteSnapshot?.status === 'BETTING';

  const handlePlaceBet = () => {
    if (busy || !isBettingOpen) return;
    setBusy(true);
    getSocket().emit(
      'roulette:place_bet',
      {
        wager,
        betKind,
        betNumber: betKind === 'NUMBER' ? betNumber : undefined,
      },
      (res) => {
        setBusy(false);
        if (!res.ok) {
          pushToast(res.error || 'Mise refusée', 'error');
        } else {
          if (res.newBalance !== undefined) setBalance(res.newBalance);
          sound.click();
          pushToast(`Mise placée sur ${formatBetLabel({ betKind, betNumber })} !`, 'success');
        }
      }
    );
  };

  const colorClass = (c: 'GREEN' | 'RED' | 'BLACK') =>
    c === 'GREEN'
      ? 'bg-[#00e701] text-[#071824]'
      : c === 'RED'
      ? 'bg-red-600 text-white'
      : 'bg-[#213743] text-white border border-[#3a5466]';

  const allBets = rouletteSnapshot?.bets || [];
  const redBets = allBets.filter((b) => b.betKind === 'RED');
  const blackBets = allBets.filter((b) => b.betKind === 'BLACK');
  const specialBets = allBets.filter((b) => b.betKind !== 'RED' && b.betKind !== 'BLACK');

  const renderBetGroup = (title: string, badgeColor: string, list: LiveRouletteBetDTO[]) => {
    const total = list.reduce((s, b) => s + b.wager, 0);
    return (
      <div className="bg-[#14232f] border border-[#253b4d] rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between text-xs font-extrabold pb-2 border-b border-[#223545]">
          <span className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${badgeColor}`} />
            {title} ({list.length})
          </span>
          <span className="font-mono text-[#00e701] tabular-nums">{formatCredits(total)} $</span>
        </div>
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {list.length === 0 ? (
            <div className="text-[11px] text-[#7f93a4] text-center py-2">Aucune mise</div>
          ) : (
            list.map((b) => (
              <div
                key={b.betId}
                className="flex items-center justify-between text-[11px] bg-[#0c1722] rounded px-2.5 py-1.5"
              >
                <span className="font-bold text-white truncate max-w-[95px]">{b.username}</span>
                <span className="text-[#b1bad3] text-[10px]">{formatBetLabel(b)}</span>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    b.won ? 'text-[#00e701]' : 'text-slate-300'
                  }`}
                >
                  {b.won && b.payout ? `+${formatCredits(b.payout)}` : formatCredits(b.wager)} $
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Barre d'état Live + Historique global */}
      <div className="gaming-panel border border-[#253b4d] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#00e701]/15 border border-[#00e701]/30 text-[#00e701] text-xs font-black">
            <span className="w-2 h-2 rounded-full bg-[#00e701] animate-pulse" />
            ROULETTE LIVE
          </span>
          <span className="text-xs font-mono font-bold text-[#b1bad3]">
            Manche #{rouletteSnapshot?.roundNumber || 1}
          </span>
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            {rouletteSnapshot?.status === 'BETTING' ? (
              <span className="font-mono tabular-nums text-amber-300">
                Tirage dans {countdownSec.toFixed(1)}s
              </span>
            ) : rouletteSnapshot?.status === 'SPINNING' ? (
              <span className="text-[#00e701]">La roue tourne...</span>
            ) : (
              <span className="text-[#00e701]">
                Résultat : #{rouletteSnapshot?.winningNumber}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(rouletteSnapshot?.history || []).map((h) => (
            <span
              key={h.roundNumber}
              className={`w-7 h-7 rounded-md font-mono text-xs font-black flex items-center justify-center shrink-0 ${colorClass(
                h.winningColor
              )}`}
            >
              {h.winningNumber}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Contrôles Gauche */}
        <div className="lg:col-span-4 gaming-panel border border-[#253b4d] rounded-2xl p-5 space-y-4 h-fit">
          <WagerInput wagerCents={wager} onChange={setWager} disabled={!isBettingOpen} />

          <div className="bg-[#0c1722] border border-[#253b4d] rounded-xl p-3.5 text-xs space-y-1">
            <div className="text-[#b1bad3]">Pari sélectionné</div>
            <div className="text-sm font-black text-[#00e701]">
              {formatBetLabel({ betKind, betNumber })}
            </div>
          </div>

          <button
            onClick={handlePlaceBet}
            disabled={!isBettingOpen || busy}
            className="w-full py-3.5 rounded-xl btn-3d-green text-[#071824] font-black text-sm sm:text-base transition disabled:opacity-40"
          >
            {isBettingOpen
              ? `Placer la Mise (${formatCredits(wager)} $)`
              : rouletteSnapshot?.status === 'SPINNING'
              ? 'Tirage en cours...'
              : 'Nouvelle manche imminente...'}
          </button>

          <div className="text-[11px] text-[#7f93a4] flex items-center justify-between pt-1">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#00e701]" />
              {allBets.length} mise(s) sur cette manche
            </span>
            <span>Max 6 mises / manche</span>
          </div>
        </div>

        {/* Roue Synchronisée + Tapis Européen */}
        <div className="lg:col-span-8 gaming-panel border border-[#253b4d] rounded-2xl p-5 space-y-5">
          {/* Barre de progression du compte à rebours */}
          <div className="h-1.5 w-full bg-[#0c1722] rounded-full overflow-hidden">
            <div
              style={{
                width: `${
                  rouletteSnapshot?.status === 'BETTING'
                    ? Math.min(100, (countdownSec / 12) * 100)
                    : 0
                }%`,
              }}
              className="h-full bg-[#00e701] transition-all duration-100"
            />
          </div>

          {/* Rouleau Européen Synchronisé */}
          <div className="relative bg-[#0c1722] border border-[#253b4d] rounded-xl py-4 overflow-hidden">
            <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] bg-amber-400 z-20 shadow-[0_0_12px_#eab308]" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#0c1722] to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0c1722] to-transparent z-10" />

            <div ref={stripViewportRef} className="overflow-hidden">
              <motion.div
                key={spinKey}
                initial={{ x: 0 }}
                animate={{ x: spinKey === 0 ? 0 : offsetX }}
                transition={
                  spinKey === 0
                    ? { duration: 0 }
                    : { duration: spinDuration, ease: [0.1, 0.88, 0.15, 1] }
                }
                className="flex items-center"
                style={{ gap: `${TILE_GAP}px` }}
              >
                {stripNumbers.map((num, idx) => (
                  <div
                    key={idx}
                    style={{ width: `${TILE_W}px` }}
                    className={`shrink-0 h-16 rounded-xl font-mono text-xl font-black flex items-center justify-center select-none ${colorClass(
                      getRouletteColor(num)
                    )}`}
                  >
                    {num}
                  </div>
                ))}
              </motion.div>
            </div>
          </div>

          {/* Tapis de mises */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { k: 'DOZEN_1', label: '1 à 12 (3×)' },
                  { k: 'DOZEN_2', label: '13 à 24 (3×)' },
                  { k: 'DOZEN_3', label: '25 à 36 (3×)' },
                ] as const
              ).map((d) => (
                <button
                  key={d.k}
                  onClick={() => setBetKind(d.k)}
                  className={`py-2.5 rounded-xl text-xs font-extrabold border-2 transition ${
                    betKind === d.k
                      ? 'bg-[#00e701]/20 border-[#00e701] text-[#00e701]'
                      : 'bg-[#0c1722] border-[#253b4d] text-white hover:bg-[#1b2f3f]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {(
                [
                  { k: 'LOW', label: '1–18', extra: '' },
                  { k: 'EVEN', label: 'Pair', extra: '' },
                  { k: 'RED', label: 'Rouge', extra: 'bg-red-600/85 hover:bg-red-600' },
                  { k: 'BLACK', label: 'Noir', extra: 'bg-[#213743] hover:bg-[#2f4553]' },
                  { k: 'ODD', label: 'Impair', extra: '' },
                  { k: 'HIGH', label: '19–36', extra: '' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setBetKind(opt.k)}
                  className={`py-2.5 rounded-xl text-xs font-extrabold border-2 transition ${
                    betKind === opt.k
                      ? 'border-[#00e701] ring-2 ring-[#00e701]/35 text-white ' +
                        (opt.extra || 'bg-[#00e701]/20')
                      : 'border-[#253b4d] text-white ' + (opt.extra || 'bg-[#0c1722] hover:bg-[#1b2f3f]')
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="pt-1">
              <div className="grid grid-cols-7 sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1.5">
                <button
                  onClick={() => {
                    setBetKind('GREEN');
                    setBetNumber(0);
                  }}
                  className={`py-2 rounded-lg font-mono text-xs font-black transition border-2 ${
                    betKind === 'GREEN'
                      ? 'bg-[#00e701] text-[#071824] border-white'
                      : 'bg-[#00e701]/80 text-[#071824] border-transparent hover:bg-[#00e701]'
                  }`}
                >
                  0
                </button>
                {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => {
                  const c = getRouletteColor(n);
                  const selected = betKind === 'NUMBER' && betNumber === n;
                  return (
                    <button
                      key={n}
                      onClick={() => {
                        setBetKind('NUMBER');
                        setBetNumber(n);
                      }}
                      className={`py-2 rounded-lg font-mono text-xs font-black transition border-2 ${
                        selected
                          ? 'border-amber-400 scale-105 ' + colorClass(c)
                          : 'border-transparent opacity-90 hover:opacity-100 ' + colorClass(c)
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau des mises multijoueur en direct */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {renderBetGroup('Mises Rouge', 'bg-red-500', redBets)}
        {renderBetGroup('Vert & Mises Spéciales', 'bg-[#00e701]', specialBets)}
        {renderBetGroup('Mises Noir', 'bg-slate-400', blackBets)}
      </div>
    </div>
  );
};
