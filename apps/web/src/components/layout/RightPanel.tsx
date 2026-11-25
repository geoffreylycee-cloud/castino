import React, { useState, useRef, useEffect } from 'react';
import {
  Flame,
  MessageSquare,
  Send,
  PackageOpen,
  CloudRain,
  Plus,
  Check,
  Users,
} from 'lucide-react';
import { RARITIES, creditsToCents, formatCredits } from '@castino/shared';
import { getSocket } from '../../lib/socket';
import { sound } from '../../lib/sound';
import { useAuthStore } from '../../stores/useAuthStore';
import { useRealtimeStore } from '../../stores/useRealtimeStore';
import { useUIStore } from '../../stores/useUIStore';

export const RightPanel: React.FC = () => {
  const { user, setBalance } = useAuthStore();
  const { rightPanelOpen, rightPanelTab, setRightPanelTab, pushToast } = useUIStore();
  const { feedEvents, chatMessages, rainSnapshot, serverClockOffsetMs } = useRealtimeStore();

  const [chatText, setChatText] = useState('');
  const [rainCountdown, setRainCountdown] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipInput, setTipInput] = useState('100');
  const [rainBusy, setRainBusy] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (rightPanelTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, rightPanelTab]);

  // Compte à rebours de la Rain (active ou cooldown 3 min)
  useEffect(() => {
    const compute = () => {
      if (!rainSnapshot) return 0;
      return Math.max(0, Math.ceil((rainSnapshot.endsAt - (Date.now() + serverClockOffsetMs)) / 1000));
    };
    setRainCountdown(compute());
    const id = setInterval(() => setRainCountdown(compute()), 1000);
    return () => clearInterval(id);
  }, [rainSnapshot, serverClockOffsetMs]);

  if (!rightPanelOpen) return null;

  const isRainActive = rainSnapshot?.status === 'ACTIVE';
  const hasJoinedRain =
    Boolean(user?.id) &&
    Boolean(rainSnapshot?.participants.some((p) => p.userId === user?.id));

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleJoinRain = () => {
    if (rainBusy || !isRainActive || hasJoinedRain) return;
    setRainBusy(true);
    getSocket().emit('rain:join', (res) => {
      setRainBusy(false);
      if (!res.ok) {
        pushToast(res.error || 'Impossible de rejoindre la Rain', 'error');
      } else {
        sound.win();
        pushToast('Vous participez à la Rain !', 'success');
      }
    });
  };

  const handleTipRain = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = creditsToCents(parseFloat(tipInput) || 0);
    if (rainBusy || amountCents < 100) return;
    setRainBusy(true);
    getSocket().emit('rain:tip', { amountCents }, (res) => {
      setRainBusy(false);
      if (!res.ok) {
        pushToast(res.error || 'Erreur tip Rain', 'error');
      } else {
        if (res.newBalance !== undefined) setBalance(res.newBalance);
        sound.win();
        setTipOpen(false);
        pushToast(`+${formatCredits(amountCents)} $ ajoutés au pot de la Rain !`, 'success');
      }
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    setChatText('');
    getSocket().emit('chat:send', { text: trimmed }, (ack) => {
      if (!ack.ok && ack.error) {
        pushToast(ack.error, 'error');
      }
    });
  };

  const participantsCount = rainSnapshot?.participants.length ?? 0;
  const estimatedShare =
    participantsCount > 0 && rainSnapshot
      ? Math.floor(rainSnapshot.potCents / participantsCount)
      : rainSnapshot?.potCents ?? 0;

  return (
    <aside className="hidden xl:flex flex-col w-72 bg-[#14232f] border-l border-[#213545] shrink-0">
      <div className="grid grid-cols-2 p-2 gap-1 bg-[#0c1722] border-b border-[#213545]">
        <button
          onClick={() => setRightPanelTab('feed')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition ${
            rightPanelTab === 'feed'
              ? 'bg-[#1f3444] text-white'
              : 'text-[#b1bad3] hover:text-white'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>Live Drops</span>
        </button>
        <button
          onClick={() => setRightPanelTab('chat')}
          className={`relative flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition ${
            rightPanelTab === 'chat'
              ? 'bg-[#1f3444] text-white'
              : 'text-[#b1bad3] hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#00e701]" />
          <span>Chat</span>
          {isRainActive && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded bg-sky-400 text-[#071824] text-[9px] font-black animate-pulse">
              RAIN
            </span>
          )}
        </button>
      </div>

      {rightPanelTab === 'feed' ? (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {feedEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-2 text-[#b1bad3]">
              <PackageOpen className="w-7 h-7 opacity-40" />
              <div className="text-xs font-bold text-white">Aucun drop récent</div>
              <p className="text-[11px] leading-relaxed">
                Les ouvertures et gains réels des joueurs apparaîtront ici en direct.
              </p>
            </div>
          ) : (
            feedEvents.map((ev) => {
              const rarityMeta = ev.rarity ? RARITIES[ev.rarity] : null;
              return (
                <div
                  key={ev.id}
                  style={{
                    borderLeftColor: rarityMeta ? rarityMeta.color : '#00e701',
                  }}
                  className="bg-[#1b2e3d] border-l-[3px] rounded-md p-2 flex items-center gap-2.5 hover:bg-[#233a4c] transition"
                >
                  {ev.imageUrl ? (
                    <img
                      src={ev.imageUrl}
                      alt={ev.title}
                      className="w-10 h-10 object-contain shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-[#0c1722] flex items-center justify-center font-mono text-xs font-bold text-[#00e701] shrink-0">
                      {ev.multiplier.toFixed(1)}×
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-white truncate">{ev.username}</span>
                      <span className="font-mono text-xs font-bold text-[#00e701] shrink-0 tabular-nums">
                        +{formatCredits(ev.amount)} $
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-200 truncate">{ev.title}</div>
                    <div className="text-[10px] text-[#b1bad3] truncate">{ev.subtitle}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* ==================== BANNIÈRE COMPACTE CHAT RAIN ==================== */}
          {isRainActive && rainSnapshot ? (
            <div className="m-2.5 mb-1 rounded-xl bg-gradient-to-br from-sky-500/20 via-[#162a3a] to-[#0f1f2b] border border-sky-400/50 p-2.5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-sky-300">
                  <CloudRain className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
                  RAIN EN COURS
                </span>
                <span className="font-mono text-[11px] font-black text-amber-300 tabular-nums">
                  {formatTimer(rainCountdown)}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <div className="font-mono text-lg font-black text-[#00e701] tabular-nums leading-none">
                  {formatCredits(rainSnapshot.potCents)} $
                </div>
                <div className="text-[10px] text-[#b1bad3] flex items-center gap-1 font-semibold">
                  <Users className="w-3 h-3 text-sky-300" />
                  <span>{participantsCount}</span>
                  {participantsCount > 0 && (
                    <span className="text-white font-mono">
                      (~{formatCredits(estimatedShare)} $)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleJoinRain}
                  disabled={hasJoinedRain || rainBusy}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition ${
                    hasJoinedRain
                      ? 'bg-[#00e701]/20 border border-[#00e701]/40 text-[#00e701]'
                      : 'bg-[#00e701] hover:bg-[#1fff20] text-[#071824]'
                  }`}
                >
                  {hasJoinedRain ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Inscrit</span>
                    </>
                  ) : (
                    <span>Rejoindre la Rain</span>
                  )}
                </button>

                <button
                  onClick={() => setTipOpen((o) => !o)}
                  title="Ajouter de l'argent dans le pot"
                  className="px-2.5 py-1.5 rounded-lg bg-[#0c1722] hover:bg-[#1e3445] border border-sky-400/30 text-[11px] font-bold text-sky-300 flex items-center gap-0.5 transition"
                >
                  <Plus className="w-3 h-3" />
                  <span>Pot</span>
                </button>
              </div>

              {tipOpen && (
                <form onSubmit={handleTipRain} className="flex gap-1 pt-1">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={tipInput}
                    onChange={(e) => setTipInput(e.target.value)}
                    className="flex-1 bg-[#0c1722] border border-[#253b4d] rounded-md px-2 py-1 font-mono text-xs text-white focus:outline-none focus:border-sky-400"
                    placeholder="Montant $"
                  />
                  <button
                    type="submit"
                    disabled={rainBusy}
                    className="px-2.5 py-1 rounded-md bg-sky-400 hover:bg-sky-300 text-[#071824] font-black text-[11px]"
                  >
                    Ajouter
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="mx-2.5 mt-2 px-2.5 py-1.5 rounded-lg bg-[#0c1722] border border-[#223545] flex items-center justify-between text-[10px] text-[#7f93a4]">
              <span className="flex items-center gap-1.5 font-semibold">
                <CloudRain className="w-3 h-3 text-sky-400" />
                Prochaine Rain auto
              </span>
              <span className="font-mono font-bold text-slate-300 tabular-nums">
                {formatTimer(rainCountdown)}
              </span>
            </div>
          )}

          {/* Messages du Chat */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {chatMessages.length === 0 && (
              <div className="text-center text-xs text-[#b1bad3] py-10">
                Aucun message dans le salon.
              </div>
            )}
            {chatMessages.map((msg) => {
              const isSystem = msg.userId === 'system';
              return (
                <div
                  key={msg.id}
                  className={`rounded-md px-3 py-2 text-xs ${
                    isSystem
                      ? 'bg-sky-500/15 border border-sky-400/30 text-sky-100'
                      : 'bg-[#1b2e3d]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={`font-bold ${
                        isSystem
                          ? 'text-sky-300'
                          : msg.isGuest
                          ? 'text-sky-400'
                          : 'text-[#00e701]'
                      }`}
                    >
                      {msg.username}
                    </span>
                    <span className="text-[10px] text-[#7f93a4]">
                      {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-100 break-words leading-relaxed">{msg.text}</p>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          <form
            onSubmit={handleSendChat}
            className="p-2.5 bg-[#0c1722] border-t border-[#213545] flex gap-1.5"
          >
            <input
              type="text"
              maxLength={220}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Message..."
              className="flex-1 bg-[#1b2e3d] border border-[#294050] rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-[#557086]"
            />
            <button
              type="submit"
              className="px-3 rounded-md bg-[#00e701] hover:bg-[#1fff20] text-[#071824] transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
};
