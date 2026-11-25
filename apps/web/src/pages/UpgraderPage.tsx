import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  ArrowLeftRight,
  ArrowUpDown,
  Backpack,
  Check,
  Coins,
  Search,
  Zap,
} from 'lucide-react';
import {
  RARITIES,
  formatCredits,
  type InventoryItemDTO,
  type ItemDTO,
  type ItemRarity,
  type UpgraderPlayResponse,
  type UpgraderRollMode,
} from '@castino/shared';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

const EXAMPLE_KNIFE_IMG =
  'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2avx-9ytd5lRi67gVNwsDvSwtqqc3iXZg4kCZYjReYLtRbum9XgYuvm5wbWjtgUzCn3iSsf8G81tFEeH9rw';

const EXAMPLE_DLORE_IMG =
  'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk4veqYaF7IfysCnWRxuF4j-B-Xxa_nBovp3Pdwtj9cC_GaAd0DZdwQu9fuhS4kNy0NePntVTbjYpCyyT_3CgY5i9j_a9cBkcCWUKV';

export const UpgraderPage: React.FC = () => {
  const { user, setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [inventory, setInventory] = useState<InventoryItemDTO[]>([]);
  const [selectedInvIds, setSelectedInvIds] = useState<string[]>([]);
  const [balanceAddCents, setBalanceAddCents] = useState(0);

  const [targets, setTargets] = useState<ItemDTO[]>([]);
  const [targetsTotal, setTargetsTotal] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState<ItemDTO | null>(null);
  const [search, setSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState<'ALL' | ItemRarity>('ALL');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeMultiplierPreset, setActiveMultiplierPreset] = useState<number | null>(null);

  const [rollMode, setRollMode] = useState<UpgraderRollMode>('UNDER');
  const [fastMode, setFastMode] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [needleAngle, setNeedleAngle] = useState(0);
  const [spinDuration, setSpinDuration] = useState(0);
  const [lastResult, setLastResult] = useState<UpgraderPlayResponse | null>(null);
  const [streak, setStreak] = useState(0);

  const userBalance = user?.balance ?? 0;

  const loadInventory = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: InventoryItemDTO[] }>('/api/inventory');
      setInventory(res.items);
    } catch {
      // ignore
    }
  }, []);

  const loadTargets = useCallback(
    async (opts?: { minPrice?: number; maxPrice?: number }) => {
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (rarityFilter !== 'ALL') params.set('rarity', rarityFilter);
        params.set('sort', sortDir);
        params.set('limit', '60');
        if (opts?.minPrice && opts.minPrice > 0) params.set('minPrice', String(opts.minPrice));
        if (opts?.maxPrice && opts.maxPrice > 0) params.set('maxPrice', String(opts.maxPrice));

        const res = await apiFetch<{ items: ItemDTO[]; total: number }>(
          `/api/games/upgrader/targets?${params.toString()}`
        );
        setTargets(res.items);
        setTargetsTotal(res.total);
        return res.items;
      } catch {
        return [];
      }
    },
    [search, rarityFilter, sortDir]
  );

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadTargets();
    }, 180);
    return () => clearTimeout(t);
  }, [loadTargets]);

  const selectedInvItems = useMemo(
    () => inventory.filter((i) => selectedInvIds.includes(i.id)),
    [inventory, selectedInvIds]
  );

  const skinsValueCents = useMemo(
    () => selectedInvItems.reduce((sum, i) => sum + i.item.value, 0),
    [selectedInvItems]
  );

  const totalInputValue = skinsValueCents + balanceAddCents;

  const chancePercent = useMemo(() => {
    if (!selectedTarget || totalInputValue <= 0) return 0;
    if (selectedTarget.value <= totalInputValue) return 0;
    const raw = (totalInputValue / selectedTarget.value) * 96;
    if (raw < 1) return 0;
    return Math.min(80, Math.round(raw * 1000) / 1000);
  }, [selectedTarget, totalInputValue]);

  const targetMultiplier = useMemo(() => {
    if (!selectedTarget || totalInputValue <= 0) return 0;
    return Math.round((selectedTarget.value / totalInputValue) * 100) / 100;
  }, [selectedTarget, totalInputValue]);

  const canUpgrade =
    !spinning &&
    selectedTarget !== null &&
    totalInputValue >= 10 &&
    chancePercent >= 1 &&
    selectedTarget.value > totalInputValue;

  const toggleInvItem = (id: string) => {
    if (spinning) return;
    sound.click();
    setLastResult(null);
    setSelectedInvIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 12 ? [...prev, id] : prev
    );
  };

  const applyMultiplierPreset = async (mult: number) => {
    sound.click();
    setActiveMultiplierPreset(mult);
    const base = totalInputValue > 0 ? totalInputValue : Math.min(userBalance, 1000);
    if (totalInputValue === 0 && base >= 10) {
      setBalanceAddCents(base);
    }
    const desired = Math.round(base * mult);
    const list = await loadTargets({
      minPrice: Math.round(desired * 0.7),
      maxPrice: Math.round(desired * 1.45),
    });
    if (list.length > 0) {
      // Trouver le skin le plus proche du prix souhaité
      const closest = list.reduce((best, cur) =>
        Math.abs(cur.value - desired) < Math.abs(best.value - desired) ? cur : best
      );
      setSelectedTarget(closest);
    }
  };

  const handleUpgrade = async () => {
    if (!canUpgrade || !selectedTarget) return;
    setSpinning(true);
    setLastResult(null);

    try {
      const res = await apiFetch<UpgraderPlayResponse>('/api/games/upgrader/play', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemIds: selectedInvIds,
          balanceAddCents,
          targetItemId: selectedTarget.id,
          rollMode,
        }),
      });

      const durationSec = fastMode ? 0.55 : 4.2;
      setSpinDuration(durationSec);

      // L'aiguille tourne de 5 tours complets + l'angle exact du roll (0..100 -> 0..360°)
      const rollDegrees = (res.roll / 100) * 360;
      const baseSpins = Math.floor(needleAngle / 360) * 360 + (fastMode ? 720 : 1800);
      setNeedleAngle(baseSpins + rollDegrees);

      if (!fastMode) {
        [120, 260, 440, 680, 980, 1340, 1780, 2320, 2950, 3620].forEach((ms) =>
          setTimeout(() => sound.tick(), ms)
        );
      } else {
        sound.tick();
      }

      setTimeout(() => {
        setSpinning(false);
        setLastResult(res);
        setBalance(res.newBalance);
        setSelectedInvIds([]);
        setBalanceAddCents(0);
        void loadInventory();

        if (res.won) {
          setStreak((s) => s + 1);
          sound.legendaryDrop();
          confetti({ particleCount: 90, spread: 75, origin: { y: 0.55 } });
          pushToast(
            `UPGRADE RÉUSSI ! ${res.targetItem.name} (${formatCredits(res.targetItem.value)} $) ajouté à votre inventaire !`,
            'success'
          );
        } else {
          setStreak(0);
          sound.bust();
        }
      }, durationSec * 1000 + 80);
    } catch (err: unknown) {
      setSpinning(false);
      pushToast(err instanceof Error ? err.message : 'Erreur Upgrader', 'error');
    }
  };

  const handleSellWonSkin = async () => {
    if (!lastResult?.wonInventoryItem) return;
    try {
      const res = await apiFetch<{ sellPrice: number; newBalance: number }>(
        `/api/inventory/${lastResult.wonInventoryItem.id}/sell`,
        { method: 'POST' }
      );
      setBalance(res.newBalance);
      setLastResult(null);
      void loadInventory();
      sound.win();
      pushToast(`Skin vendu pour +${formatCredits(res.sellPrice)} $ !`, 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur revente', 'error');
    }
  };

  // Calcul géométrique de l'arc circulaire gagnant (rayon 96, circonférence 2*PI*96 ≈ 603.18)
  const radius = 96;
  const circumference = 2 * Math.PI * radius;
  const winArcLength = (chancePercent / 100) * circumference;
  const arcRotation = rollMode === 'UNDER' ? -90 : -90 + (100 - chancePercent) * 3.6;

  return (
    <div className="space-y-6">
      {/* ==================== SCÈNE PRINCIPALE HELLCASE UPGRADER ==================== */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0d111d] border border-purple-500/20 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
        {/* Halo radial violet/émeraude style Hellcase */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(139,92,246,0.22),transparent_58%)]" />

        {/* Barre supérieure (Titre + Streaks) */}
        <div className="relative z-10 flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-black tracking-tight">CS2 Skin Upgrader</h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              480 Skins CS2
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs font-extrabold text-slate-200">
              SÉRIE : <span className="text-[#00e701] font-mono">{streak}</span>
            </div>
          </div>
        </div>

        {/* Zone 3 colonnes : Skin(s) misés | Roue Hexagonale | Skin Cible */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 items-center gap-6 px-6 py-8">
          {/* GAUCHE : Items sélectionnés */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center min-h-[210px] text-center">
            {selectedInvItems.length > 0 ? (
              <div className="space-y-2 flex flex-col items-center">
                <div className="relative flex items-center justify-center">
                  <img
                    src={selectedInvItems[0].item.imageUrl}
                    alt={selectedInvItems[0].item.name}
                    className="w-44 h-32 object-contain drop-shadow-[0_12px_24px_rgba(139,92,246,0.35)]"
                  />
                  {selectedInvItems.length > 1 && (
                    <span className="absolute -top-1 -right-2 px-2 py-0.5 rounded-full bg-purple-600 text-[11px] font-black">
                      +{selectedInvItems.length - 1}
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold text-slate-300">
                  {selectedInvItems.length === 1
                    ? `${selectedInvItems[0].item.weaponOrCategory} | ${selectedInvItems[0].item.name}`
                    : `${selectedInvItems.length} skins sélectionnés`}
                </div>
                <div className="font-mono text-sm font-black text-[#00e701] tabular-nums">
                  {formatCredits(totalInputValue)} $
                  {balanceAddCents > 0 && (
                    <span className="text-[11px] text-purple-300 ml-1">
                      (+{formatCredits(balanceAddCents)} $)
                    </span>
                  )}
                </div>
              </div>
            ) : balanceAddCents > 0 ? (
              <div className="space-y-2">
                <div className="w-24 h-24 rounded-full bg-[#00e701]/10 border-2 border-[#00e701]/40 flex items-center justify-center mx-auto">
                  <Coins className="w-10 h-10 text-[#00e701]" />
                </div>
                <div className="text-xs font-bold text-slate-300">Mise directe en Solde</div>
                <div className="font-mono text-lg font-black text-[#00e701] tabular-nums">
                  {formatCredits(balanceAddCents)} $
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2">
                <img
                  src={EXAMPLE_KNIFE_IMG}
                  alt="Butterfly Knife Fade"
                  className="w-44 h-32 object-contain opacity-55 drop-shadow-[0_14px_26px_rgba(168,85,247,0.3)] hover:opacity-80 transition"
                />
                <div className="text-sm font-bold text-slate-200">Ajouter des skins</div>
                <div className="text-[11px] text-slate-400">
                  Choisissez dans votre inventaire ou utilisez le curseur $
                </div>
              </div>
            )}
          </div>

          {/* CENTRE : Cadran Hexagonal + Roue Animée */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center">
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
              <svg viewBox="0 0 260 260" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1e1b38" />
                    <stop offset="100%" stopColor="#101322" />
                  </linearGradient>
                  <linearGradient id="winArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#00e701" />
                  </linearGradient>
                </defs>

                {/* Cadran circulaire externe sobre */}
                <circle
                  cx="130"
                  cy="130"
                  r="118"
                  fill="url(#hexGrad)"
                  stroke={
                    lastResult
                      ? lastResult.won
                        ? '#00e701'
                        : '#ef4444'
                      : 'rgba(168,85,247,0.45)'
                  }
                  strokeWidth="3"
                />
                <circle
                  cx="130"
                  cy="130"
                  r="111"
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />

                {/* Cercle gradué interne */}
                <circle
                  cx="130"
                  cy="130"
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="10"
                />

                {/* Arc de probabilité gagnante */}
                {chancePercent > 0 && (
                  <circle
                    cx="130"
                    cy="130"
                    r={radius}
                    fill="none"
                    stroke="url(#winArcGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${winArcLength} ${circumference}`}
                    transform={`rotate(${arcRotation} 130 130)`}
                    className="transition-all duration-300"
                  />
                )}

                {/* Graduations (ticks) */}
                {Array.from({ length: 36 }).map((_, i) => {
                  const deg = i * 10;
                  return (
                    <line
                      key={i}
                      x1="130"
                      y1="44"
                      x2="130"
                      y2={i % 3 === 0 ? '52' : '48'}
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth={i % 3 === 0 ? '2' : '1'}
                      transform={`rotate(${deg} 130 130)`}
                    />
                  );
                })}
              </svg>

              {/* Aiguille laser rotative */}
              <motion.div
                animate={{ rotate: needleAngle }}
                transition={{
                  duration: spinDuration,
                  ease: [0.1, 0.88, 0.16, 1],
                }}
                className="pointer-events-none absolute inset-0 flex items-start justify-center"
              >
                <div className="mt-4 flex flex-col items-center">
                  <div className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[13px] border-l-transparent border-r-transparent border-t-white drop-shadow-[0_0_8px_#fff]" />
                  <div className="w-[2px] h-16 bg-gradient-to-b from-purple-300 via-purple-400/50 to-transparent" />
                </div>
              </motion.div>

              {/* Affichage central du pourcentage */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <div
                  className={`font-mono text-3xl sm:text-4xl font-black tracking-tight tabular-nums ${
                    lastResult
                      ? lastResult.won
                        ? 'text-[#00e701]'
                        : 'text-red-400'
                      : 'text-white'
                  }`}
                >
                  {chancePercent.toFixed(3)}%
                </div>
                {targetMultiplier > 0 && (
                  <div className="text-xs font-mono font-bold text-purple-300 mt-1">
                    {targetMultiplier.toFixed(2)}× · {rollMode === 'UNDER' ? 'Roll Under' : 'Roll Over'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DROITE : Skin Cible sélectionné */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center min-h-[210px] text-center">
            {selectedTarget ? (
              <div className="space-y-2 flex flex-col items-center">
                <img
                  src={selectedTarget.imageUrl}
                  alt={selectedTarget.name}
                  className="w-44 h-32 object-contain drop-shadow-[0_14px_26px_rgba(0,231,1,0.28)]"
                />
                <span
                  style={{ color: RARITIES[selectedTarget.rarity].color }}
                  className="text-[10px] font-black uppercase tracking-wider"
                >
                  {RARITIES[selectedTarget.rarity].label}
                </span>
                <div className="text-sm font-black text-white">
                  {selectedTarget.weaponOrCategory} | {selectedTarget.name}
                </div>
                <div className="font-mono text-base font-black text-[#00e701] tabular-nums">
                  {formatCredits(selectedTarget.value)} $
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2">
                <img
                  src={EXAMPLE_DLORE_IMG}
                  alt="AWP Dragon Lore"
                  className="w-48 h-32 object-contain opacity-55 drop-shadow-[0_14px_26px_rgba(234,179,8,0.3)] hover:opacity-80 transition"
                />
                <div className="text-sm font-bold text-slate-200">Choisir un skin cible</div>
                <div className="text-[11px] text-slate-400">
                  Parcourez les 480 skins CS2 ci-dessous
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bannière de résultat immédiat après le spin */}
        {lastResult && !spinning && (
          <div
            className={`mx-6 mb-4 rounded-2xl p-4 border flex flex-wrap items-center justify-between gap-4 ${
              lastResult.won
                ? 'bg-[#00e701]/10 border-[#00e701]/50'
                : 'bg-red-500/10 border-red-500/40'
            }`}
          >
            <div className="text-sm font-extrabold">
              {lastResult.won ? (
                <span className="text-[#00e701]">
                  ★ UPGRADE RÉUSSI ! (Roll {lastResult.roll.toFixed(3)}%) — {lastResult.targetItem.name} gagné !
                </span>
              ) : (
                <span className="text-red-400">
                  Upgrade manqué (Roll {lastResult.roll.toFixed(3)}% · Chance {lastResult.chancePercent.toFixed(2)}%)
                </span>
              )}
            </div>
            {lastResult.won && lastResult.wonInventoryItem && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleSellWonSkin()}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#071824] font-extrabold text-xs transition"
                >
                  Vendre +{formatCredits(lastResult.targetItem.value)} $
                </button>
                <button
                  onClick={() => setLastResult(null)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5 text-[#00e701]" />
                  <span>Garder</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== BARRE DE CONTRÔLE BASSE (Identique à Hellcase) ==================== */}
        <div className="relative z-10 bg-[#121726]/90 border-t border-white/[0.07] px-6 py-4 grid grid-cols-1 lg:grid-cols-12 items-center gap-4">
          {/* Curseur d'ajout de solde (+ $0.00) */}
          <div className="lg:col-span-4 flex items-center gap-3">
            <span className="font-mono text-xs font-extrabold text-[#00e701] whitespace-nowrap tabular-nums">
              + {formatCredits(balanceAddCents)} $
            </span>
            <input
              type="range"
              min={0}
              max={Math.min(userBalance, selectedTarget ? Math.max(0, Math.floor(selectedTarget.value * 0.8) - skinsValueCents) : userBalance)}
              step={10}
              disabled={spinning || userBalance < 10}
              value={balanceAddCents}
              onChange={(e) => setBalanceAddCents(parseInt(e.target.value, 10))}
              className="flex-1 accent-purple-500 cursor-pointer"
            />
          </div>

          {/* Bouton principal UPGRADE + Fast Mode ⚡ + Flip Under/Over */}
          <div className="lg:col-span-4 flex items-center justify-center gap-2">
            <button
              onClick={() => {
                sound.click();
                setRollMode((m) => (m === 'UNDER' ? 'OVER' : 'UNDER'));
              }}
              disabled={spinning}
              title="Inverser la zone gagnante (Roll Under / Over)"
              className="p-3.5 rounded-xl bg-[#1c2237] hover:bg-[#262e49] border border-white/[0.08] text-purple-300 transition"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => void handleUpgrade()}
              disabled={!canUpgrade}
              className="flex-1 max-w-[220px] py-3.5 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-400 hover:to-fuchsia-400 text-white font-black text-sm tracking-wide shadow-[0_0_24px_rgba(168,85,247,0.4)] transition disabled:opacity-35 disabled:shadow-none"
            >
              {spinning ? 'UPGRADE...' : 'UPGRADE'}
            </button>

            <button
              onClick={() => {
                sound.click();
                setFastMode((f) => !f);
              }}
              title="Mode Rapide"
              className={`p-3.5 rounded-xl border transition ${
                fastMode
                  ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                  : 'bg-[#1c2237] hover:bg-[#262e49] border-white/[0.08] text-slate-400'
              }`}
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>

          {/* Raccourcis Multiplicateurs 1.5X | 2X | 5X | 10X */}
          <div className="lg:col-span-4 grid grid-cols-4 gap-2">
            {[1.5, 2, 5, 10].map((m) => (
              <button
                key={m}
                disabled={spinning}
                onClick={() => void applyMultiplierPreset(m)}
                className={`py-2.5 rounded-xl font-mono text-xs font-extrabold border transition ${
                  activeMultiplierPreset === m
                    ? 'bg-purple-500/25 border-purple-400 text-white'
                    : 'bg-[#1c2237] hover:bg-[#262e49] border-white/[0.07] text-slate-300'
                }`}
              >
                {m}X
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== SÉLECTEURS BAS : INVENTAIRE | SKINS CIBLES ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* GAUCHE : Mon Inventaire */}
        <div className="lg:col-span-5 bg-[#13212c] border border-white/[0.07] rounded-2xl p-5 flex flex-col max-h-[540px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black flex items-center gap-2">
              <Backpack className="w-4 h-4 text-[#00e701]" />
              <span>Mon Inventaire ({inventory.length})</span>
            </h2>
            {selectedInvIds.length > 0 && (
              <button
                onClick={() => setSelectedInvIds([])}
                className="text-xs font-bold text-slate-400 hover:text-white"
              >
                Désélectionner ({selectedInvIds.length})
              </button>
            )}
          </div>

          {inventory.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-xs text-slate-400 space-y-2">
              <p>Votre inventaire est vide.</p>
              <p className="text-[11px] text-slate-500">
                Ouvrez la Free Prisma Case (0 $) ou utilisez le curseur <b>+ $</b> ci-dessus pour upgrader directement avec votre solde !
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-y-auto pr-1">
              {inventory.map((inv) => {
                const isSel = selectedInvIds.includes(inv.id);
                const rMeta = RARITIES[inv.item.rarity];
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => toggleInvItem(inv.id)}
                    style={{ borderBottomColor: rMeta.color }}
                    className={`rounded-xl p-2.5 border border-b-4 text-left transition flex flex-col items-center ${
                      isSel
                        ? 'bg-purple-500/20 border-purple-400 ring-2 ring-purple-500/40'
                        : 'bg-[#0b141c] hover:bg-[#192b38] border-white/[0.06]'
                    }`}
                  >
                    <img
                      src={inv.item.imageUrl}
                      alt={inv.item.name}
                      className="w-16 h-14 object-contain"
                    />
                    <div className="text-[10px] text-slate-400 truncate w-full text-center mt-1">
                      {inv.item.weaponOrCategory}
                    </div>
                    <div className="text-[11px] font-bold text-white truncate w-full text-center">
                      {inv.item.name}
                    </div>
                    <div className="font-mono text-[11px] font-extrabold text-[#00e701] mt-0.5 tabular-nums">
                      {formatCredits(inv.item.value)} $
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* DROITE : Catalogue des Skins Cibles (tous les skins des 24 caisses) */}
        <div className="lg:col-span-7 bg-[#13212c] border border-white/[0.07] rounded-2xl p-5 flex flex-col max-h-[540px]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-black">
              Skins Cibles CS2 <span className="text-slate-400 font-normal">({targetsTotal})</span>
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setActiveMultiplierPreset(null);
                    setSearch(e.target.value);
                  }}
                  placeholder="AK-47, AWP, Karambit..."
                  className="w-44 bg-[#0b141c] border border-white/[0.08] focus:border-purple-400 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>

              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value as 'ALL' | ItemRarity)}
                className="bg-[#0b141c] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none"
              >
                <option value="ALL">Toutes raretés</option>
                <option value="LEGENDARY">Légendaire ★</option>
                <option value="EPIC">Secret (Rouge)</option>
                <option value="RARE">Classifié (Rose)</option>
                <option value="UNCOMMON">Restreint (Violet)</option>
                <option value="COMMON">Mil-Spec (Bleu)</option>
              </select>

              <button
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b141c] border border-white/[0.08] text-xs font-bold text-slate-200"
              >
                <ArrowUpDown className="w-3 h-3 text-purple-400" />
                <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 overflow-y-auto pr-1">
            {targets.map((item) => {
              const isSelected = selectedTarget?.id === item.id;
              const rMeta = RARITIES[item.rarity];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (spinning) return;
                    sound.click();
                    setSelectedTarget(item);
                    setLastResult(null);
                  }}
                  style={{ borderBottomColor: rMeta.color }}
                  className={`rounded-xl p-2.5 border border-b-4 transition flex flex-col items-center ${
                    isSelected
                      ? 'bg-[#00e701]/15 border-[#00e701] ring-2 ring-[#00e701]/40'
                      : 'bg-[#0b141c] hover:bg-[#192b38] border-white/[0.06]'
                  }`}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    className="w-16 h-14 object-contain"
                  />
                  <div className="text-[10px] text-slate-400 truncate w-full text-center mt-1">
                    {item.weaponOrCategory}
                  </div>
                  <div className="text-[11px] font-bold text-white truncate w-full text-center">
                    {item.name}
                  </div>
                  <div className="font-mono text-[11px] font-extrabold text-[#00e701] mt-0.5 tabular-nums">
                    {formatCredits(item.value)} $
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
