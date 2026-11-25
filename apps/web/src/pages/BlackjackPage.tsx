import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { formatCredits, type BlackjackAction, type BlackjackStateDTO, type PlayingCard } from '@castino/shared';
import { WagerInput } from '../components/common/WagerInput';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

const SUIT_SYMBOLS: Record<PlayingCard['suit'], { symbol: string; red: boolean }> = {
  hearts: { symbol: '♥', red: true },
  diamonds: { symbol: '♦', red: true },
  spades: { symbol: '♠', red: false },
  clubs: { symbol: '♣', red: false },
};

const CardView: React.FC<{ card?: PlayingCard; hidden?: boolean; index: number }> = ({
  card,
  hidden,
  index,
}) => {
  if (hidden || !card) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -25, rotateY: 90 }}
        animate={{ opacity: 1, y: 0, rotateY: 0 }}
        transition={{ delay: index * 0.08 }}
        className="w-20 h-28 sm:w-24 sm:h-36 rounded-xl bg-gradient-to-br from-[#213743] to-[#0f1923] border-2 border-[#00e701]/50 shadow-xl flex items-center justify-center"
      >
        <div className="w-14 h-22 sm:w-16 sm:h-28 rounded-lg border border-[#00e701]/30 flex items-center justify-center font-black text-xs text-[#00e701]">
          CaSTIno
        </div>
      </motion.div>
    );
  }

  const suitMeta = SUIT_SYMBOLS[card.suit];

  return (
    <motion.div
      initial={{ opacity: 0, y: -25, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08 }}
      className="w-20 h-28 sm:w-24 sm:h-36 rounded-xl bg-white text-slate-900 border-2 border-slate-200 shadow-xl p-2.5 flex flex-col justify-between select-none"
    >
      <div className={`font-black text-base sm:text-lg leading-none ${suitMeta.red ? 'text-red-600' : 'text-slate-900'}`}>
        <div>{card.rank}</div>
        <div className="text-sm">{suitMeta.symbol}</div>
      </div>

      <div className={`text-3xl sm:text-4xl self-center ${suitMeta.red ? 'text-red-600' : 'text-slate-900'}`}>
        {suitMeta.symbol}
      </div>

      <div
        className={`font-black text-sm leading-none self-end rotate-180 ${
          suitMeta.red ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {card.rank}
      </div>
    </motion.div>
  );
};

export const BlackjackPage: React.FC = () => {
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [wager, setWager] = useState(500);
  const [game, setGame] = useState<BlackjackStateDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ game: BlackjackStateDTO | null }>('/api/games/blackjack/active')
      .then((res) => {
        if (res.game) {
          setGame(res.game);
          setWager(res.game.wager);
        }
      })
      .catch(() => {});
  }, []);

  const isPlaying = game?.outcome === 'PLAYING';

  const announceOutcome = (g: BlackjackStateDTO) => {
    if (g.outcome === 'PLAYING') {
      sound.card();
      return;
    }
    if (g.outcome === 'BLACKJACK' || g.outcome === 'WIN') {
      sound.win();
      pushToast(
        `${g.outcome === 'BLACKJACK' ? 'BLACKJACK 3:2 !' : 'Victoire !'} +${formatCredits(g.payout)} cr`,
        'success'
      );
    } else if (g.outcome === 'PUSH') {
      sound.click();
      pushToast('Égalité (Push) — Mise remboursée.', 'info');
    } else {
      sound.bust();
    }
  };

  const handleDeal = async () => {
    if (busy || isPlaying) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ game: BlackjackStateDTO }>('/api/games/blackjack/deal', {
        method: 'POST',
        body: JSON.stringify({ wager }),
      });
      setGame(res.game);
      if (res.game.newBalance !== undefined) setBalance(res.game.newBalance);
      announceOutcome(res.game);
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur Blackjack', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (action: BlackjackAction) => {
    if (busy || !isPlaying) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ game: BlackjackStateDTO }>('/api/games/blackjack/action', {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setGame(res.game);
      if (res.game.newBalance !== undefined) setBalance(res.game.newBalance);
      announceOutcome(res.game);
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Action refusée', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Contrôles Stake Blackjack */}
      <div className="lg:col-span-4 bg-[#213743] border border-[#2f4553] rounded-2xl p-5 space-y-5 h-fit">
        <WagerInput wagerCents={wager} onChange={setWager} disabled={isPlaying} />

        {isPlaying ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => void handleAction('HIT')}
                disabled={busy}
                className="py-3.5 rounded-xl bg-[#2f4553] hover:bg-[#3d5a6c] font-extrabold text-sm text-white transition disabled:opacity-40"
              >
                Tirer (Hit)
              </button>
              <button
                onClick={() => void handleAction('STAND')}
                disabled={busy}
                className="py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 font-extrabold text-sm text-[#071824] transition disabled:opacity-40"
              >
                Rester (Stand)
              </button>
            </div>
            <button
              onClick={() => void handleAction('DOUBLE')}
              disabled={busy || !game?.canDouble}
              className="w-full py-3.5 rounded-xl bg-[#00e701] hover:bg-[#1fff20] font-black text-sm text-[#071824] transition disabled:opacity-35"
            >
              Doubler (Double ×2)
            </button>
          </div>
        ) : (
          <button
            onClick={handleDeal}
            disabled={busy}
            className="w-full py-4 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-base shadow-neon transition disabled:opacity-50"
          >
            Distribuer les Cartes
          </button>
        )}

        <div className="text-[11px] text-stake-muted bg-[#0f1923] rounded-xl p-3 space-y-1">
          <div>• Le Blackjack paie <b className="text-white">3:2 (2.50×)</b></div>
          <div>• Le Croupier tire jusqu&apos;à 16 et reste à 17</div>
          <div>• Sabot infini Provably Fair vérifiable</div>
        </div>
      </div>

      {/* Tapis de Blackjack */}
      <div className="lg:col-span-8 bg-[#0f1923] border-2 border-[#213743] rounded-2xl p-6 sm:p-10 flex flex-col justify-between min-h-[470px] relative">
        {/* Croupier */}
        <div className="flex flex-col items-center space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-stake-muted">
              Croupier
            </span>
            {game && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#213743] font-mono text-xs font-extrabold text-white">
                {game.dealerEval.display}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-2.5 min-h-[144px] flex-wrap">
            {game ? (
              <>
                {game.dealerCards.map((c, idx) => (
                  <CardView key={`d-${idx}-${c.code}`} card={c} index={idx} />
                ))}
                {game.dealerHiddenCount > 0 && <CardView hidden index={1} />}
              </>
            ) : (
              <div className="text-xs text-stake-muted italic">
                Placez votre mise pour lancer la main
              </div>
            )}
          </div>
        </div>

        {/* Bannière centrale de résultat */}
        {game && game.outcome !== 'PLAYING' && (
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="my-4 self-center px-6 py-2.5 rounded-full border-2 bg-[#1a2c38] text-center"
            style={{
              borderColor:
                game.outcome === 'WIN' || game.outcome === 'BLACKJACK'
                  ? '#00e701'
                  : game.outcome === 'PUSH'
                  ? '#eab308'
                  : '#ef4444',
            }}
          >
            <span className="font-extrabold text-sm">
              {game.outcome === 'BLACKJACK' && `BLACKJACK ! +${formatCredits(game.payout)} cr`}
              {game.outcome === 'WIN' && `Gagné ! +${formatCredits(game.payout)} cr`}
              {game.outcome === 'PUSH' && `Égalité (Push) · ${formatCredits(game.payout)} cr`}
              {game.outcome === 'LOSE' && 'La banque gagne'}
            </span>
          </motion.div>
        )}

        {/* Joueur */}
        <div className="flex flex-col items-center space-y-3">
          <div className="flex items-center justify-center gap-2.5 min-h-[144px] flex-wrap">
            {game?.playerCards.map((c, idx) => (
              <CardView key={`p-${idx}-${c.code}`} card={c} index={idx} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-stake-muted">
              Votre Main
            </span>
            {game && (
              <span
                className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-extrabold ${
                  game.playerEval.isBust
                    ? 'bg-red-500 text-white'
                    : 'bg-[#00e701] text-[#071824]'
                }`}
              >
                {game.playerEval.display}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
