import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowLeft, Zap, Play, Coins, Check, RotateCcw } from 'lucide-react';
import {
  RARITIES,
  formatCredits,
  type CaseDTO,
  type CaseOpenResponse,
  type ItemDTO,
} from '@castino/shared';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

const CARD_WIDTH = 152;
const CARD_GAP = 10;
const CARD_STEP = CARD_WIDTH + CARD_GAP;

export const CaseDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [caseData, setCaseData] = useState<CaseDTO | null>(null);
  const [reel, setReel] = useState<ItemDTO[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [fastOpen, setFastOpen] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const [targetOffset, setTargetOffset] = useState(0);
  const [spinDuration, setSpinDuration] = useState(0);

  const [wonResult, setWonResult] = useState<{
    item: ItemDTO;
    inventoryItemId?: string;
    rollTicket: number;
    isDemo: boolean;
  } | null>(null);
  const [sellingDrop, setSellingDrop] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slug) return;
    apiFetch<{ case: CaseDTO }>(`/api/cases/${slug}`)
      .then((res) => {
        setCaseData(res.case);
        const items = (res.case.items || []).map((ci) => ci.item);
        if (items.length > 0) {
          const initialReel = Array.from({ length: 30 }, (_, i) => items[i % items.length]);
          setReel(initialReel);
        }
      })
      .catch(() => pushToast('Impossible de charger cette caisse', 'error'));
  }, [slug, pushToast]);

  const runSpinAnimation = (
    reelItems: ItemDTO[],
    winningIndex: number,
    wonItem: ItemDTO,
    rollTicket: number,
    isDemo: boolean,
    inventoryItemId?: string
  ) => {
    setWonResult(null);
    setReel(reelItems);

    const containerWidth = viewportRef.current?.clientWidth || 820;
    const jitter = (Math.random() - 0.5) * (CARD_WIDTH * 0.55);
    const finalX = -(winningIndex * CARD_STEP - containerWidth / 2 + CARD_WIDTH / 2 + jitter);

    const durationSec = fastOpen ? 0.55 : 4.6;
    setSpinDuration(durationSec);
    setTargetOffset(finalX);
    setSpinKey((k) => k + 1);
    setSpinning(true);

    // Ticks sonores réalistes qui ralentissent pendant la décélération
    if (!fastOpen) {
      const tickMoments = [
        90, 180, 280, 390, 510, 640, 780, 940, 1120, 1320, 1550, 1820, 2130, 2490, 2900, 3380, 3920,
      ];
      tickMoments.forEach((ms) => setTimeout(() => sound.tick(), ms));
    } else {
      sound.tick();
    }

    setTimeout(() => {
      setSpinning(false);
      setWonResult({ item: wonItem, inventoryItemId, rollTicket, isDemo });

      if (RARITIES[wonItem.rarity].order >= 4) {
        sound.legendaryDrop();
        confetti({
          particleCount: 85,
          spread: 70,
          origin: { y: 0.6 },
        });
      } else {
        sound.win();
      }
    }, durationSec * 1000 + 80);
  };

  const handleOpenCase = async (isDemo = false) => {
    if (!caseData || spinning) return;
    try {
      if (isDemo) {
        const res = await apiFetch<{
          rollTicket: number;
          wonItem: ItemDTO;
          reelItems: ItemDTO[];
          winningIndex: number;
        }>(`/api/cases/${caseData.slug}/demo`, { method: 'POST' });

        runSpinAnimation(res.reelItems, res.winningIndex, res.wonItem, res.rollTicket, true);
      } else {
        const res = await apiFetch<CaseOpenResponse>(`/api/cases/${caseData.slug}/open`, {
          method: 'POST',
        });
        setBalance(res.newBalance);
        runSpinAnimation(
          res.reelItems,
          res.winningIndex,
          res.wonItem,
          res.rollTicket,
          false,
          res.inventoryItem.id
        );
      }
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Ouverture impossible', 'error');
    }
  };

  const handleInstantSell = async () => {
    if (!wonResult?.inventoryItemId || sellingDrop) return;
    setSellingDrop(true);
    try {
      const res = await apiFetch<{ sellPrice: number; newBalance: number }>(
        `/api/inventory/${wonResult.inventoryItemId}/sell`,
        { method: 'POST' }
      );
      setBalance(res.newBalance);
      sound.win();
      pushToast(`Vendu pour +${formatCredits(res.sellPrice)} crédits !`, 'success');
      setWonResult(null);
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur de vente', 'error');
    } finally {
      setSellingDrop(false);
    }
  };

  if (!caseData) {
    return <div className="py-16 text-center text-stake-muted">Chargement de la caisse...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/cases"
            className="p-2.5 rounded-xl bg-[#1a2c38] hover:bg-[#213743] border border-[#2f4553] text-stake-muted hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-black">{caseData.name}</h1>
            <p className="text-xs text-stake-muted">{caseData.description}</p>
          </div>
        </div>

        <button
          onClick={() => setFastOpen((f) => !f)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-extrabold transition ${
            fastOpen
              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
              : 'bg-[#1a2c38] border-[#2f4553] text-stake-muted hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Fast Open {fastOpen ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Rouleau Horizontal Hellcase */}
      <div className="bg-[#13212c] border border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-6">
        {/* Boîte dédiée uniquement au rouleau et au pointeur laser */}
        <div className="relative rounded-xl bg-[#0b141c] border border-white/[0.07] overflow-hidden">
          {/* Pointeur Laser Central (strictement confiné au rouleau) */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center justify-between">
            <div className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[9px] border-l-transparent border-r-transparent border-t-[#00e701]" />
            <div className="w-[2px] flex-1 bg-[#00e701] shadow-[0_0_12px_#00e701]" />
            <div className="w-0 h-0 border-l-[7px] border-r-[7px] border-b-[9px] border-l-transparent border-r-transparent border-b-[#00e701]" />
          </div>

          {/* Dégradés latéraux d'assombrissement */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0b141c] to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0b141c] to-transparent z-10" />

          <div ref={viewportRef} className="overflow-hidden py-4 px-2">
            <motion.div
              key={spinKey}
              initial={{ x: 0 }}
              animate={{ x: spinKey === 0 ? 0 : targetOffset }}
              transition={
                spinKey === 0
                  ? { duration: 0 }
                  : {
                      duration: spinDuration,
                      ease: [0.1, 0.86, 0.16, 1],
                    }
              }
              className="flex items-center"
              style={{ gap: `${CARD_GAP}px` }}
            >
              {reel.map((item, idx) => {
                const rMeta = RARITIES[item.rarity];
                return (
                  <div
                    key={`${spinKey}-${idx}`}
                    style={{
                      width: `${CARD_WIDTH}px`,
                      borderBottomColor: rMeta.color,
                      background: `radial-gradient(circle at 50% 35%, ${rMeta.bgGlow}, #111e28 82%)`,
                    }}
                    className="shrink-0 h-40 rounded-xl border border-white/[0.07] border-b-4 p-3 flex flex-col items-center justify-between select-none"
                  >
                    <span className="text-[10px] font-bold text-slate-400 truncate w-full text-center">
                      {item.weaponOrCategory}
                    </span>
                    <img src={item.imageUrl} alt={item.name} className="w-20 h-20 object-contain" />
                    <div className="w-full text-center">
                      <div className="text-xs font-extrabold text-white truncate">{item.name}</div>
                      <div className="font-mono text-[11px] font-bold text-[#00e701] tabular-nums">
                        {formatCredits(item.value)} $
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>

        {/* Boutons d'action proprement sous le rouleau */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            disabled={spinning}
            onClick={() => void handleOpenCase(false)}
            className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-sm sm:text-base shadow-neon transition disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {spinning
                ? 'Ouverture en cours...'
                : caseData.price === 0
                ? 'Ouvrir GRATUITEMENT (0,00 $)'
                : `Ouvrir pour ${formatCredits(caseData.price)} $`}
            </span>
          </button>

          <button
            disabled={spinning}
            onClick={() => void handleOpenCase(true)}
            className="px-5 py-3.5 rounded-xl bg-[#213743] hover:bg-[#2f4553] border border-[#2f4553] text-xs sm:text-sm font-bold text-stake-muted hover:text-white transition disabled:opacity-50"
          >
            Spin Démo Gratuit
          </button>
        </div>
      </div>

      {/* Carte de Révélation du Drop */}
      {wonResult && !spinning && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            borderColor: RARITIES[wonResult.item.rarity].color,
            boxShadow: `0 0 35px ${RARITIES[wonResult.item.rarity].bgGlow}`,
          }}
          className="bg-[#213743] border-2 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6"
        >
          <div className="flex items-center gap-5">
            <img
              src={wonResult.item.imageUrl}
              alt={wonResult.item.name}
              className="w-24 h-24 object-contain"
            />
            <div>
              <div className="flex items-center gap-2">
                <span
                  style={{ backgroundColor: RARITIES[wonResult.item.rarity].color }}
                  className="text-[10px] font-black uppercase px-2 py-0.5 rounded text-white"
                >
                  {RARITIES[wonResult.item.rarity].label}
                </span>
                {wonResult.isDemo && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-700 text-slate-200">
                    Tirage Démo
                  </span>
                )}
                <span className="font-mono text-[11px] text-stake-muted">
                  Ticket #{wonResult.rollTicket}
                </span>
              </div>
              <h3 className="text-xl font-black mt-1">
                {wonResult.item.weaponOrCategory} | {wonResult.item.name}
              </h3>
              <div className="font-mono text-lg font-extrabold text-[#00e701] mt-0.5 tabular-nums">
                Valeur : {formatCredits(wonResult.item.value)} $
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!wonResult.isDemo && wonResult.inventoryItemId && (
              <button
                disabled={sellingDrop}
                onClick={handleInstantSell}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#071824] font-extrabold text-xs sm:text-sm transition"
              >
                <Coins className="w-4 h-4" />
                <span>Vendre +{formatCredits(wonResult.item.value)} $</span>
              </button>
            )}
            <button
              onClick={() => setWonResult(null)}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-[#0f1923] hover:bg-[#1a2c38] border border-[#2f4553] text-xs font-bold text-white transition"
            >
              {wonResult.isDemo ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Fermer</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-[#00e701]" />
                  <span>Garder dans l&apos;Inventaire</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Contenu & Probabilités de la caisse */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold">Contenu de la Caisse &amp; Probabilités Exactes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {(caseData.items || []).map((ci) => {
            const rMeta = RARITIES[ci.item.rarity];
            return (
              <div
                key={ci.id}
                style={{ borderBottomColor: rMeta.color }}
                className="bg-[#213743] border border-[#2f4553] border-b-4 rounded-xl p-4 flex flex-col items-center text-center"
              >
                <div className="w-full flex items-center justify-between text-[10px] font-mono text-stake-muted">
                  <span>{ci.chancePercent}%</span>
                  <span>
                    #{ci.ticketStart}–{ci.ticketEnd}
                  </span>
                </div>
                <img
                  src={ci.item.imageUrl}
                  alt={ci.item.name}
                  className="w-20 h-20 object-contain my-2"
                />
                <div className="text-[11px] text-stake-muted">{ci.item.weaponOrCategory}</div>
                <div className="text-xs font-extrabold text-white truncate w-full">
                  {ci.item.name}
                </div>
                <div className="mt-1.5 font-mono text-xs font-bold text-[#00e701] tabular-nums">
                  {formatCredits(ci.item.value)} $
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
