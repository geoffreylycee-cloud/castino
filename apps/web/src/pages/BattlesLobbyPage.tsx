import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  Plus,
  RotateCcw,
  Search,
  Swords,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { formatCredits, type CaseBattleMode, type CaseDTO } from '@castino/shared';
import { apiFetch } from '../lib/api';
import { getSocket } from '../lib/socket';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useRealtimeStore } from '../stores/useRealtimeStore';
import { useUIStore } from '../stores/useUIStore';

const MODES: { key: CaseBattleMode; label: string; desc: string }[] = [
  { key: '1v1', label: '1v1', desc: 'Duel' },
  { key: '1v1v1', label: '1v1v1', desc: '3 Joueurs' },
  { key: '1v1v1v1', label: '1v1v1v1', desc: '4 Joueurs' },
  { key: '2v2', label: '2v2', desc: 'Équipes' },
  { key: '3v3', label: '3v3', desc: '3 vs 3' },
];

export const BattlesLobbyPage: React.FC = () => {
  const navigate = useNavigate();
  const { setBalance } = useAuthStore();
  const { battles } = useRealtimeStore();
  const { pushToast } = useUIStore();

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [allCases, setAllCases] = useState<CaseDTO[]>([]);
  const [search, setSearch] = useState('');

  // État du Créateur de Battle
  const [mode, setMode] = useState<CaseBattleMode>('1v1');
  const [reverseMode, setReverseMode] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getSocket().emit('battles:request_list');
    apiFetch<{ cases: CaseDTO[] }>('/api/cases')
      .then((res) => setAllCases(res.cases.filter((c) => c.price > 0)))
      .catch(() => {});
  }, []);

  const caseBySlug = useMemo(() => new Map(allCases.map((c) => [c.slug, c])), [allCases]);
  const selectedCaseObjects = useMemo(
    () => selectedSlugs.map((s) => caseBySlug.get(s)).filter((c): c is CaseDTO => Boolean(c)),
    [selectedSlugs, caseBySlug]
  );
  const totalCost = selectedCaseObjects.reduce((sum, c) => sum + c.price, 0);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allCases.filter((c) => c.name.toLowerCase().includes(q)) : allCases;
  }, [allCases, search]);

  const addCase = (slug: string) => {
    if (selectedSlugs.length >= 10) {
      pushToast('Maximum 10 caisses par Case Battle.', 'info');
      return;
    }
    sound.click();
    setSelectedSlugs((prev) => [...prev, slug]);
  };

  const removeCaseAt = (idx: number) => {
    sound.click();
    setSelectedSlugs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateBattle = () => {
    if (creating || selectedSlugs.length === 0) return;
    setCreating(true);
    getSocket().emit(
      'battles:create',
      { mode, reverseMode, fastMode, caseSlugs: selectedSlugs },
      (res) => {
        setCreating(false);
        if (!res.ok || !res.battleId) {
          pushToast(res.error || 'Création impossible', 'error');
          return;
        }
        if (res.newBalance !== undefined) setBalance(res.newBalance);
        sound.win();
        setCreatorOpen(false);
        setSelectedSlugs([]);
        navigate(`/battles/${res.battleId}`);
      }
    );
  };

  const handleJoin = (battleId: string) => {
    getSocket().emit('battles:join', { battleId }, (res) => {
      if (!res.ok) {
        pushToast(res.error || 'Impossible de rejoindre', 'error');
        return;
      }
      if (res.newBalance !== undefined) setBalance(res.newBalance);
      sound.click();
      navigate(`/battles/${battleId}`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Lobby */}
      <div className="bg-[#13212c]/90 border border-white/[0.07] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5">
            <Swords className="w-7 h-7 text-[#00e701]" />
            <span>Case Battles CS2</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Affrontez de vrais joueurs ou appelez des Bots en <b className="text-white">1v1, 1v1v1, 2v2, 3v3</b> · Modes <b className="text-purple-300">Reverse</b> &amp; <b className="text-amber-300">Fast ⚡</b>.
          </p>
        </div>

        <button
          onClick={() => {
            sound.click();
            setCreatorOpen((o) => !o);
          }}
          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-sm shadow-[0_0_20px_rgba(0,231,1,0.35)] transition"
        >
          {creatorOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4 stroke-[3]" />}
          <span>{creatorOpen ? 'Fermer le Créateur' : 'Créer une Battle'}</span>
        </button>
      </div>

      {/* Créateur de Case Battle */}
      {creatorOpen && (
        <div className="bg-[#13212c] border-2 border-[#00e701]/40 rounded-2xl p-6 space-y-6 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            {/* Choix du Mode */}
            <div className="lg:col-span-6 space-y-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Mode de Battle
              </span>
              <div className="grid grid-cols-5 gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className={`py-2.5 px-2 rounded-xl border text-center transition ${
                      mode === m.key
                        ? 'bg-[#00e701]/20 border-[#00e701] text-white'
                        : 'bg-[#0b141c] border-white/[0.07] text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="font-mono text-sm font-black">{m.label}</div>
                    <div className="text-[10px] opacity-80">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Modificateurs Reverse & Fast */}
            <div className="lg:col-span-6 space-y-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Options Spéciales
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setReverseMode((r) => !r)}
                  className={`p-3 rounded-xl border flex items-center justify-between transition ${
                    reverseMode
                      ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                      : 'bg-[#0b141c] border-white/[0.07] text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-purple-400" />
                    <div className="text-left">
                      <div className="text-xs font-black">Mode Reverse</div>
                      <div className="text-[10px] opacity-75">Le plus bas total gagne</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black">{reverseMode ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => setFastMode((f) => !f)}
                  className={`p-3 rounded-xl border flex items-center justify-between transition ${
                    fastMode
                      ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                      : 'bg-[#0b141c] border-white/[0.07] text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <div className="text-left">
                      <div className="text-xs font-black">Mode Fast ⚡</div>
                      <div className="text-[10px] opacity-75">Manches ultra-rapides</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black">{fastMode ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Caisses sélectionnées pour la Battle */}
          <div className="bg-[#0b141c] border border-white/[0.08] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-300">
                Caisses sélectionnées ({selectedSlugs.length} / 10)
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-black text-[#00e701] tabular-nums">
                  Coût total : {formatCredits(totalCost)} $
                </span>
                <button
                  disabled={creating || selectedSlugs.length === 0}
                  onClick={handleCreateBattle}
                  className="px-5 py-2 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-xs transition disabled:opacity-40"
                >
                  {creating ? 'Création...' : `Lancer la Battle (${formatCredits(totalCost)} $)`}
                </button>
              </div>
            </div>

            {selectedCaseObjects.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                Cliquez sur une ou plusieurs caisses CS2 ci-dessous pour les ajouter à la battle.
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {selectedCaseObjects.map((c, idx) => (
                  <button
                    key={`${c.slug}-${idx}`}
                    onClick={() => removeCaseAt(idx)}
                    title="Retirer cette caisse"
                    className="group relative shrink-0 w-20 bg-[#13212c] hover:bg-red-950/60 border border-white/[0.08] hover:border-red-500 rounded-xl p-2 flex flex-col items-center transition"
                  >
                    <img src={c.imageUrl} alt={c.name} className="w-12 h-10 object-contain" />
                    <span className="text-[10px] font-mono font-bold text-[#00e701] mt-1">
                      {formatCredits(c.price)} $
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sélecteur de caisses CS2 */}
          <div className="space-y-3">
            <div className="relative max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer les caisses CS2..."
                className="w-full bg-[#0b141c] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#00e701]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {filteredCases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addCase(c.slug)}
                  className="bg-[#0b141c] hover:bg-[#192b38] border border-white/[0.07] hover:border-[#00e701]/60 rounded-xl p-2.5 flex flex-col items-center text-center transition"
                >
                  <img src={c.imageUrl} alt={c.name} className="w-16 h-12 object-contain" />
                  <div className="text-[11px] font-bold text-white truncate w-full mt-1">
                    {c.name}
                  </div>
                  <div className="font-mono text-[11px] font-extrabold text-[#00e701] tabular-nums">
                    {formatCredits(c.price)} $
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Liste des Case Battles en direct */}
      {battles.length === 0 ? (
        <div className="bg-[#13212c] border border-white/[0.07] rounded-2xl p-12 text-center space-y-3">
          <Swords className="w-12 h-12 text-slate-500 mx-auto" />
          <div className="text-base font-extrabold">Aucune Case Battle en cours</div>
          <p className="text-xs text-slate-400">
            Créez votre première battle 1v1, 2v2 ou 3v3 et affrontez vos amis ou des Bots !
          </p>
          <button
            onClick={() => setCreatorOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00e701] text-[#071824] font-black text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Créer une Case Battle</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {battles.map((b) => {
            const filledCount = b.slots.filter((s) => s.userId !== null).length;
            return (
              <div
                key={b.id}
                className="bg-[#13212c] border border-white/[0.07] hover:border-white/[0.16] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition"
              >
                {/* Infos mode & statut */}
                <div className="flex flex-wrap items-center gap-2.5 min-w-[210px]">
                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${
                      b.status === 'WAITING'
                        ? 'bg-[#00e701]/15 text-[#00e701] border border-[#00e701]/30'
                        : b.status === 'RUNNING'
                        ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30 animate-pulse'
                        : 'bg-white/[0.06] text-slate-400'
                    }`}
                  >
                    {b.status === 'WAITING'
                      ? 'En attente'
                      : b.status === 'RUNNING'
                      ? `Round ${b.currentRoundIndex + 1}/${b.cases.length}`
                      : 'Terminée'}
                  </span>

                  <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-white/[0.06] text-white">
                    {b.mode}
                  </span>

                  {b.reverseMode && (
                    <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      REVERSE
                    </span>
                  )}
                  {b.fastMode && (
                    <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-amber-400/20 text-amber-300">
                      ⚡ FAST
                    </span>
                  )}
                </div>

                {/* Aperçu des caisses */}
                <div className="flex items-center gap-1.5 overflow-x-auto flex-1 py-1">
                  {b.cases.map((c, idx) => (
                    <img
                      key={`${c.slug}-${idx}`}
                      src={c.imageUrl}
                      alt={c.name}
                      title={`${c.name} (${formatCredits(c.price)} $)`}
                      className="w-11 h-9 object-contain shrink-0"
                    />
                  ))}
                </div>

                {/* Joueurs & Action */}
                <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="font-mono">
                      {filledCount}/{b.maxPlayers}
                    </span>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Coût</div>
                    <div className="font-mono text-sm font-black text-[#00e701] tabular-nums">
                      {formatCredits(b.totalCost)} $
                    </div>
                  </div>

                  {b.status === 'WAITING' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleJoin(b.id)}
                        className="px-4 py-2.5 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-xs transition"
                      >
                        Rejoindre
                      </button>
                      <Link
                        to={`/battles/${b.id}`}
                        className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 transition"
                        title="Ouvrir la salle"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </div>
                  ) : (
                    <Link
                      to={`/battles/${b.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-bold text-white transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{b.status === 'RUNNING' ? 'Regarder Live' : 'Résultats'}</span>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
