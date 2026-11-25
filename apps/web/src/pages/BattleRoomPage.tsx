import React, { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Bot,
  Crown,
  RotateCcw,
  Swords,
  UserPlus,
  Zap,
} from 'lucide-react';
import { RARITIES, formatCredits, type ItemDTO } from '@castino/shared';
import { getSocket } from '../lib/socket';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useRealtimeStore } from '../stores/useRealtimeStore';
import { useUIStore } from '../stores/useUIStore';

const ROW_HEIGHT = 112;
const ROW_GAP = 8;
const ROW_STEP = ROW_HEIGHT + ROW_GAP;
const VIEWPORT_HEIGHT = 220;

const VerticalReel: React.FC<{
  spinKey: string;
  reelItems: ItemDTO[];
  winningIndex: number;
  fastMode: boolean;
}> = ({ spinKey, reelItems, winningIndex, fastMode }) => {
  const targetY = -(winningIndex * ROW_STEP - VIEWPORT_HEIGHT / 2 + ROW_HEIGHT / 2);
  const duration = fastMode ? 1.1 : 3.85;

  return (
    <div
      style={{ height: `${VIEWPORT_HEIGHT}px` }}
      className="relative overflow-hidden rounded-xl bg-[#0b141c] border border-white/[0.08]"
    >
      {/* Ligne laser horizontale centrale */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-[#00e701] shadow-[0_0_10px_#00e701] z-20" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#0b141c] to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0b141c] to-transparent z-10" />

      <motion.div
        key={spinKey}
        initial={{ y: 0 }}
        animate={{ y: targetY }}
        transition={{ duration, ease: [0.1, 0.88, 0.16, 1] }}
        className="flex flex-col px-2"
        style={{ gap: `${ROW_GAP}px` }}
      >
        {reelItems.map((item, i) => {
          const rMeta = RARITIES[item.rarity];
          return (
            <div
              key={`${spinKey}-${i}`}
              style={{
                height: `${ROW_HEIGHT}px`,
                borderLeftColor: rMeta.color,
                background: `radial-gradient(circle at 50% 50%, ${rMeta.bgGlow}, #0f1923 80%)`,
              }}
              className="shrink-0 rounded-lg border border-white/[0.06] border-l-4 px-2 py-1.5 flex flex-col items-center justify-between"
            >
              <img src={item.imageUrl} alt={item.name} className="w-16 h-14 object-contain" />
              <div className="w-full text-center">
                <div className="text-[11px] font-extrabold text-white truncate">{item.name}</div>
                <div className="font-mono text-[10px] font-bold text-[#00e701]">
                  {formatCredits(item.value)} $
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
};

export const BattleRoomPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, setBalance } = useAuthStore();
  const { battles } = useRealtimeStore();
  const { pushToast } = useUIStore();
  const celebratedRef = useRef<string | null>(null);

  useEffect(() => {
    getSocket().emit('battles:request_list');
  }, []);

  const battle = battles.find((b) => b.id === id);

  // Effets sonores au lancement de chaque manche
  useEffect(() => {
    if (battle?.status === 'RUNNING' && battle.activeRoundSpin) {
      sound.tick();
      if (!battle.fastMode) {
        [350, 800, 1400, 2100, 2900].forEach((ms) => setTimeout(() => sound.tick(), ms));
      }
    }
  }, [battle?.status, battle?.currentRoundIndex, battle?.fastMode, battle?.activeRoundSpin]);

  // Confettis en fin de battle si le joueur courant gagne
  useEffect(() => {
    if (!battle || battle.status !== 'FINISHED' || celebratedRef.current === battle.id) return;
    celebratedRef.current = battle.id;
    const mySlot = battle.slots.find((s) => s.userId === user?.id);
    if (mySlot && battle.winnerSlotIndices.includes(mySlot.slotIndex)) {
      sound.legendaryDrop();
      confetti({ particleCount: 95, spread: 80, origin: { y: 0.55 } });
      pushToast(
        `VICTOIRE CASE BATTLE ! +${formatCredits(battle.payoutPerWinner)} $ crédités !`,
        'success'
      );
    } else if (mySlot) {
      sound.bust();
    }
  }, [battle, user?.id, pushToast]);

  if (!battle) {
    return (
      <div className="py-20 text-center space-y-4">
        <div className="text-slate-400">Chargement de la salle Case Battle...</div>
        <Link to="/battles" className="text-xs font-bold text-[#00e701] hover:underline">
          ← Retour au lobby Case Battles
        </Link>
      </div>
    );
  }

  const isCreator = battle.creatorUserId === user?.id;
  const alreadyJoined = battle.slots.some((s) => s.userId === user?.id);

  const handleCallBots = () => {
    getSocket().emit('battles:call_bots', { battleId: battle.id }, (res) => {
      if (!res.ok) {
        pushToast(res.error || 'Impossible d’appeler les bots', 'error');
      } else {
        sound.click();
      }
    });
  };

  const handleJoinSlot = (slotIndex: number) => {
    getSocket().emit('battles:join', { battleId: battle.id, slotIndex }, (res) => {
      if (!res.ok) {
        pushToast(res.error || 'Impossible de rejoindre', 'error');
      } else {
        if (res.newBalance !== undefined) setBalance(res.newBalance);
        sound.win();
      }
    });
  };

  const handleRematch = () => {
    getSocket().emit(
      'battles:create',
      {
        mode: battle.mode,
        reverseMode: battle.reverseMode,
        fastMode: battle.fastMode,
        caseSlugs: battle.cases.map((c) => c.slug),
      },
      (res) => {
        if (!res.ok || !res.battleId) {
          pushToast(res.error || 'Impossible de recréer', 'error');
          return;
        }
        if (res.newBalance !== undefined) setBalance(res.newBalance);
        navigate(`/battles/${res.battleId}`);
      }
    );
  };

  const team0Total = battle.slots
    .filter((s) => s.team === 0)
    .reduce((sum, s) => sum + s.totalValue, 0);
  const team1Total = battle.slots
    .filter((s) => s.team === 1)
    .reduce((sum, s) => sum + s.totalValue, 0);

  const gridColsClass =
    battle.maxPlayers === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : battle.maxPlayers === 3
      ? 'grid-cols-1 md:grid-cols-3'
      : battle.maxPlayers === 4
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';

  return (
    <div className="space-y-5">
      {/* Header Salle Battle */}
      <div className="bg-[#13212c] border border-white/[0.07] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/battles"
            className="p-2.5 rounded-xl bg-[#0b141c] hover:bg-[#1a2c38] border border-white/[0.08] text-slate-300 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black flex items-center gap-1.5">
                <Swords className="w-5 h-5 text-[#00e701]" />
                <span>Case Battle {battle.mode}</span>
              </h1>
              {battle.reverseMode && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <RotateCcw className="w-3 h-3" /> REVERSE
                </span>
              )}
              {battle.fastMode && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-amber-400/20 text-amber-300">
                  <Zap className="w-3 h-3" /> FAST
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-mono">
              Coût d&apos;entrée : {formatCredits(battle.totalCost)} $ · Pot actuel :{' '}
              <b className="text-[#00e701]">{formatCredits(battle.totalPotValue)} $</b>
            </div>
          </div>
        </div>

        {/* Boutons d'action contextuels */}
        <div className="flex items-center gap-2">
          {battle.status === 'WAITING' && isCreator && (
            <button
              onClick={handleCallBots}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-[0_0_18px_rgba(147,51,234,0.4)] transition"
            >
              <Bot className="w-4 h-4" />
              <span>Appeler des Bots &amp; Lancer</span>
            </button>
          )}
          {battle.status === 'FINISHED' && (
            <button
              onClick={handleRematch}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-xs shadow-neon transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Rejouer la même Battle ({formatCredits(battle.totalCost)} $)</span>
            </button>
          )}
        </div>
      </div>

      {/* Bandeau des manches (Caisses) */}
      <div className="bg-[#13212c] border border-white/[0.07] rounded-2xl p-3 flex items-center gap-2 overflow-x-auto">
        <span className="text-xs font-extrabold text-slate-400 px-2 shrink-0">
          Manche {Math.max(1, battle.currentRoundIndex + 1)} / {battle.cases.length}
        </span>
        {battle.cases.map((c, idx) => {
          const isCurrent = battle.status === 'RUNNING' && battle.currentRoundIndex === idx;
          const isDone =
            battle.status === 'FINISHED' ||
            (battle.status === 'RUNNING' && idx < battle.currentRoundIndex);
          return (
            <div
              key={`${c.slug}-${idx}`}
              className={`shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition ${
                isCurrent
                  ? 'bg-[#00e701]/15 border-[#00e701] scale-105'
                  : isDone
                  ? 'bg-[#0b141c] border-white/[0.05] opacity-45'
                  : 'bg-[#0b141c] border-white/[0.07]'
              }`}
            >
              <img src={c.imageUrl} alt={c.name} className="w-9 h-7 object-contain" />
              <span className="text-[11px] font-bold text-white hidden sm:inline">{c.name}</span>
            </div>
          );
        })}
      </div>

      {/* Score d'équipe en 2v2 / 3v3 */}
      {battle.isTeamMode && (
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`rounded-2xl p-3.5 border flex items-center justify-between ${
              battle.winnerTeam === 0
                ? 'bg-sky-500/20 border-[#00e701]'
                : 'bg-sky-500/10 border-sky-500/30'
            }`}
          >
            <span className="text-xs font-black uppercase text-sky-300">Équipe Bleue</span>
            <span className="font-mono text-base font-black text-white tabular-nums">
              {formatCredits(team0Total)} $
            </span>
          </div>
          <div
            className={`rounded-2xl p-3.5 border flex items-center justify-between ${
              battle.winnerTeam === 1
                ? 'bg-rose-500/20 border-[#00e701]'
                : 'bg-rose-500/10 border-rose-500/30'
            }`}
          >
            <span className="text-xs font-black uppercase text-rose-300">Équipe Rouge</span>
            <span className="font-mono text-base font-black text-white tabular-nums">
              {formatCredits(team1Total)} $
            </span>
          </div>
        </div>
      )}

      {/* Bannière de fin de Battle */}
      {battle.status === 'FINISHED' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-r from-[#00e701]/20 via-[#13212c] to-amber-400/20 border-2 border-[#00e701] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <Crown className="w-8 h-8 text-amber-400 shrink-0" />
            <div>
              <div className="text-base sm:text-lg font-black text-white">
                {battle.isTeamMode
                  ? `Victoire de l'${battle.winnerTeam === 0 ? 'Équipe Bleue' : 'Équipe Rouge'} !`
                  : `Victoire de ${
                      battle.slots[battle.winnerSlotIndices[0]]?.username || 'Gagnant'
                    } !`}
              </div>
              <div className="text-xs text-slate-300">
                Pot total : <b className="text-[#00e701]">{formatCredits(battle.totalPotValue)} $</b> ·{' '}
                Gain par gagnant :{' '}
                <b className="text-amber-300">{formatCredits(battle.payoutPerWinner)} $</b>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Grille Multi-Colonnes des Joueurs */}
      <div className={`grid ${gridColsClass} gap-4`}>
        {battle.slots.map((slot) => {
          const isWinner =
            battle.status === 'FINISHED' && battle.winnerSlotIndices.includes(slot.slotIndex);
          const spinData = battle.activeRoundSpin?.spins.find(
            (s) => s.slotIndex === slot.slotIndex
          );
          const teamBorder = battle.isTeamMode
            ? slot.team === 0
              ? 'border-t-sky-400'
              : 'border-t-rose-400'
            : 'border-t-[#00e701]/60';

          return (
            <div
              key={slot.slotIndex}
              className={`bg-[#13212c] border border-white/[0.08] border-t-4 ${teamBorder} rounded-2xl p-3.5 flex flex-col space-y-3 transition ${
                isWinner ? 'ring-2 ring-[#00e701] shadow-[0_0_28px_rgba(0,231,1,0.25)]' : ''
              }`}
            >
              {/* En-tête Joueur */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {slot.isBot && <Bot className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                  {isWinner && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                  <span className="text-xs font-extrabold text-white truncate">
                    {slot.username || 'Place libre'}
                  </span>
                </div>
                <span className="font-mono text-xs font-black text-[#00e701] tabular-nums shrink-0">
                  {formatCredits(slot.totalValue)} $
                </span>
              </div>

              {/* Zone Rouleau ou Place Libre */}
              {!slot.userId ? (
                <div className="h-[220px] rounded-xl bg-[#0b141c] border border-dashed border-white/15 flex flex-col items-center justify-center p-4 text-center space-y-3">
                  <div className="text-xs text-slate-400">En attente d&apos;un joueur...</div>
                  {!alreadyJoined && battle.status === 'WAITING' && (
                    <button
                      onClick={() => handleJoinSlot(slot.slotIndex)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-xs transition"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Rejoindre ({formatCredits(battle.totalCost)} $)</span>
                    </button>
                  )}
                </div>
              ) : battle.status === 'RUNNING' && spinData ? (
                <VerticalReel
                  spinKey={`${battle.id}-r${battle.currentRoundIndex}-s${slot.slotIndex}`}
                  reelItems={spinData.reelItems}
                  winningIndex={spinData.winningIndex}
                  fastMode={battle.fastMode}
                />
              ) : (
                <div className="h-[220px] rounded-xl bg-[#0b141c] border border-white/[0.06] flex flex-col items-center justify-center p-4 text-center">
                  {battle.status === 'WAITING' ? (
                    <span className="text-xs font-bold text-[#00e701]">Prêt pour la battle !</span>
                  ) : isWinner ? (
                    <div className="space-y-1">
                      <Crown className="w-10 h-10 text-amber-400 mx-auto" />
                      <div className="text-sm font-black text-[#00e701]">GAGNANT !</div>
                      <div className="font-mono text-base font-black text-white">
                        +{formatCredits(battle.payoutPerWinner)} $
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-bold text-slate-500">Manche terminée</div>
                  )}
                </div>
              )}

              {/* Skins déjà ouverts par ce joueur */}
              {slot.drops.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {slot.drops.map((d, idx) => (
                    <div
                      key={`${d.id}-${idx}`}
                      style={{ borderBottomColor: RARITIES[d.rarity].color }}
                      className="bg-[#0b141c] border border-white/[0.05] border-b-2 rounded-lg p-1.5 flex flex-col items-center text-center"
                    >
                      <img src={d.imageUrl} alt={d.name} className="w-11 h-9 object-contain" />
                      <div className="text-[9px] text-slate-300 truncate w-full">{d.name}</div>
                      <div className="font-mono text-[9px] font-bold text-[#00e701]">
                        {formatCredits(d.value)} $
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
