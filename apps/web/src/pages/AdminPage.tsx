import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Ban,
  CloudRain,
  Coins,
  Gift,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  RARITIES,
  creditsToCents,
  formatCredits,
  type ChatMessageDTO,
  type ItemDTO,
} from '@castino/shared';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

interface AdminUserRow {
  id: string;
  username: string;
  role: 'USER' | 'ADMIN';
  isGuest: boolean;
  isBanned: boolean;
  isOnline: boolean;
  balance: number;
  totalWagered: number;
  totalWon: number;
  inventoryCount: number;
  betsCount: number;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  onlineUsersCount: number;
  registeredUsers: number;
  guestUsers: number;
  totalBalanceInCirculation: number;
  totalWagered: number;
  totalBets: number;
  totalInventoryItems: number;
}

export const AdminPage: React.FC = () => {
  const { user } = useAuthStore();
  const { pushToast } = useUIStore();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ONLINE' | 'REGISTERED' | 'GUEST'>('ALL');
  const [announceText, setAnnounceText] = useState('');
  const [rainAmountInput, setRainAmountInput] = useState('5000');

  // Modale modification solde personnalisée
  const [balanceModalUser, setBalanceModalUser] = useState<AdminUserRow | null>(null);
  const [balanceMode, setBalanceMode] = useState<'SET' | 'ADD' | 'SUB'>('ADD');
  const [balanceInput, setBalanceInput] = useState('1000');

  // Modale don de skin CS2
  const [giftUser, setGiftUser] = useState<AdminUserRow | null>(null);
  const [skinSearch, setSkinSearch] = useState('');
  const [skinResults, setSkinResults] = useState<ItemDTO[]>([]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        stats: AdminStats;
        users: AdminUserRow[];
        chatMessages: ChatMessageDTO[];
      }>('/api/admin/overview');
      setStats(res.stats);
      setUsers(res.users);
      setChatMessages(res.chatMessages);
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur Admin Panel', 'error');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      void loadOverview();
    }
  }, [user?.role, loadOverview]);

  useEffect(() => {
    if (!giftUser) return;
    const t = setTimeout(() => {
      const q = new URLSearchParams({ search: skinSearch, sort: 'desc', limit: '30' });
      apiFetch<{ items: ItemDTO[] }>(`/api/games/upgrader/targets?${q.toString()}`)
        .then((res) => setSkinResults(res.items))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [giftUser, skinSearch]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (filter === 'ONLINE') return u.isOnline;
        if (filter === 'REGISTERED') return !u.isGuest;
        if (filter === 'GUEST') return u.isGuest;
        return true;
      })
      .filter((u) => (!q ? true : u.username.toLowerCase().includes(q)));
  }, [users, search, filter]);

  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const handleAdjustBalance = async (
    targetId: string,
    mode: 'SET' | 'ADD' | 'SUB',
    amountCents: number
  ) => {
    try {
      const res = await apiFetch<{ balance: number }>(`/api/admin/users/${targetId}/balance`, {
        method: 'POST',
        body: JSON.stringify({ mode, amountCents }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === targetId ? { ...u, balance: res.balance } : u))
      );
      sound.win();
      pushToast(`Solde mis à jour : ${formatCredits(res.balance)} $`, 'success');
      setBalanceModalUser(null);
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur solde', 'error');
    }
  };

  const handleToggleBan = async (u: AdminUserRow) => {
    try {
      await apiFetch(`/api/admin/users/${u.id}/ban`, {
        method: 'POST',
        body: JSON.stringify({ isBanned: !u.isBanned }),
      });
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, isBanned: !u.isBanned } : row))
      );
      pushToast(u.isBanned ? `${u.username} débanni.` : `${u.username} banni.`, 'info');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Action refusée', 'error');
    }
  };

  const handleDeleteUser = async (u: AdminUserRow) => {
    if (!window.confirm(`Supprimer définitivement le compte "${u.username}" ?`)) return;
    try {
      await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((row) => row.id !== u.id));
      pushToast(`Compte ${u.username} supprimé.`, 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur suppression', 'error');
    }
  };

  const handleCleanupGuests = async () => {
    try {
      const res = await apiFetch<{ deletedCount: number }>('/api/admin/users/cleanup-guests', {
        method: 'POST',
      });
      pushToast(`${res.deletedCount} compte(s) invité(s) inactif(s) nettoyé(s).`, 'success');
      void loadOverview();
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur nettoyage', 'error');
    }
  };

  const handleGiveSkin = async (item: ItemDTO) => {
    if (!giftUser) return;
    try {
      await apiFetch(`/api/admin/users/${giftUser.id}/give-item`, {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id }),
      });
      sound.win();
      pushToast(`${item.name} offert à ${giftUser.username} !`, 'success');
      setGiftUser(null);
      void loadOverview();
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur don skin', 'error');
    }
  };

  const handleAnnounce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceText.trim()) return;
    try {
      const res = await apiFetch<{ message: ChatMessageDTO }>('/api/admin/chat/announce', {
        method: 'POST',
        body: JSON.stringify({ text: announceText }),
      });
      setChatMessages((prev) => [res.message, ...prev]);
      setAnnounceText('');
      pushToast('Annonce envoyée dans le Chat Global !', 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur annonce', 'error');
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm('Vider tout l’historique du Chat Global ?')) return;
    try {
      await apiFetch('/api/admin/chat', { method: 'DELETE' });
      setChatMessages([]);
      pushToast('Chat Global vidé.', 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur chat', 'error');
    }
  };

  const handleForceRain = async (amountUsd?: number) => {
    const usd = amountUsd ?? (parseFloat(rainAmountInput) || 2500);
    try {
      await apiFetch('/api/admin/rain/force', {
        method: 'POST',
        body: JSON.stringify({ potCents: creditsToCents(usd), durationSeconds: 45 }),
      });
      sound.win();
      pushToast(`Rain forcée de ${usd.toLocaleString('fr-FR')} $ lancée dans le Chat !`, 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur Rain', 'error');
    }
  };

  const handleAddRainPot = async () => {
    const usd = parseFloat(rainAmountInput) || 1000;
    try {
      await apiFetch('/api/admin/rain/add-pot', {
        method: 'POST',
        body: JSON.stringify({ amountCents: creditsToCents(usd) }),
      });
      sound.win();
      pushToast(`+${usd.toLocaleString('fr-FR')} $ ajoutés au pot de la Rain !`, 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur ajout pot', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Admin */}
      <div className="gaming-panel border border-amber-400/40 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              Admin Panel <span className="text-amber-400">CaSTIno</span>
            </h1>
            <p className="text-xs text-[#b1bad3]">
              Contrôle complet des joueurs (en ligne &amp; hors ligne), soldes, skins et chat global.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCleanupGuests}
            className="px-3.5 py-2 rounded-xl bg-[#0c1722] hover:bg-[#1a2c38] border border-[#253b4d] text-xs font-bold text-[#b1bad3] hover:text-white transition"
          >
            Nettoyer Invités vides
          </button>
          <button
            onClick={() => void loadOverview()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#071824] font-black text-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="gaming-panel border border-[#253b4d] rounded-xl p-4">
            <div className="text-[11px] font-bold uppercase text-[#7f93a4]">Joueurs Total / En ligne</div>
            <div className="text-2xl font-mono font-black text-white mt-1 tabular-nums">
              {stats.totalUsers}{' '}
              <span className="text-sm text-[#00e701]">({stats.onlineUsersCount} live)</span>
            </div>
            <div className="text-[11px] text-[#b1bad3] mt-0.5">
              {stats.registeredUsers} comptes · {stats.guestUsers} invités
            </div>
          </div>

          <div className="gaming-panel border border-[#253b4d] rounded-xl p-4">
            <div className="text-[11px] font-bold uppercase text-[#7f93a4]">Argent en circulation</div>
            <div className="text-2xl font-mono font-black text-[#00e701] mt-1 tabular-nums">
              {formatCredits(stats.totalBalanceInCirculation)} $
            </div>
            <div className="text-[11px] text-[#b1bad3] mt-0.5">Somme de tous les soldes</div>
          </div>

          <div className="gaming-panel border border-[#253b4d] rounded-xl p-4">
            <div className="text-[11px] font-bold uppercase text-[#7f93a4]">Volume Total Misé</div>
            <div className="text-2xl font-mono font-black text-amber-300 mt-1 tabular-nums">
              {formatCredits(stats.totalWagered)} $
            </div>
            <div className="text-[11px] text-[#b1bad3] mt-0.5">{stats.totalBets} paris joués</div>
          </div>

          <div className="gaming-panel border border-[#253b4d] rounded-xl p-4">
            <div className="text-[11px] font-bold uppercase text-[#7f93a4]">Skins en Inventaire</div>
            <div className="text-2xl font-mono font-black text-purple-300 mt-1 tabular-nums">
              {stats.totalInventoryItems}
            </div>
            <div className="text-[11px] text-[#b1bad3] mt-0.5">Objets CS2 détenus</div>
          </div>
        </div>
      )}

      {/* Gestion complète des Joueurs */}
      <div className="gaming-panel border border-[#253b4d] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-black flex items-center gap-2">
            <Users className="w-5 h-5 text-[#00e701]" />
            <span>Tous les Joueurs ({filteredUsers.length})</span>
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un pseudo..."
                className="bg-[#0c1722] border border-[#253b4d] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            {(['ALL', 'ONLINE', 'REGISTERED', 'GUEST'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                  filter === f
                    ? 'bg-amber-400 text-[#071824] border-amber-400'
                    : 'bg-[#0c1722] border-[#253b4d] text-[#b1bad3] hover:text-white'
                }`}
              >
                {f === 'ALL' ? 'Tous' : f === 'ONLINE' ? 'En ligne' : f === 'REGISTERED' ? 'Comptes' : 'Invités'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0c1722] text-[#7f93a4] uppercase text-[10px]">
              <tr>
                <th className="py-3 px-3">Statut</th>
                <th className="py-3 px-3">Joueur</th>
                <th className="py-3 px-3 text-right">Solde Actuel</th>
                <th className="py-3 px-3 text-right">Misé / Paris</th>
                <th className="py-3 px-3 text-center">Skins</th>
                <th className="py-3 px-3 text-right">Actions Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#223545]">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[#1e3343]/50">
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        u.isOnline
                          ? 'bg-[#00e701]/15 text-[#00e701]'
                          : 'bg-white/[0.06] text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          u.isOnline ? 'bg-[#00e701]' : 'bg-slate-500'
                        }`}
                      />
                      {u.isOnline ? 'En ligne' : 'Hors ligne'}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      <span>{u.username}</span>
                      {u.role === 'ADMIN' && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-[#071824]">
                          ADMIN
                        </span>
                      )}
                      {u.isGuest && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                          INVITÉ
                        </span>
                      )}
                      {u.isBanned && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-500 text-white">
                          BANNI
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-black text-[#00e701] tabular-nums">
                    {formatCredits(u.balance)} $
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[#b1bad3] tabular-nums">
                    {formatCredits(u.totalWagered)} $ ({u.betsCount})
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-white">
                    {u.inventoryCount}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => void handleAdjustBalance(u.id, 'ADD', 100_000)}
                        title="Ajouter +1 000 $"
                        className="px-2 py-1 rounded bg-[#00e701]/15 hover:bg-[#00e701] text-[#00e701] hover:text-[#071824] font-mono text-[10px] font-black transition"
                      >
                        +1K$
                      </button>
                      <button
                        onClick={() => {
                          setBalanceModalUser(u);
                          setBalanceMode('SET');
                          setBalanceInput(String(u.balance / 100));
                        }}
                        title="Modifier le solde exact"
                        className="p-1.5 rounded bg-[#0c1722] hover:bg-[#213743] border border-[#253b4d] text-amber-300 transition"
                      >
                        <Coins className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setGiftUser(u);
                          setSkinSearch('');
                        }}
                        title="Offrir un skin CS2"
                        className="p-1.5 rounded bg-[#0c1722] hover:bg-[#213743] border border-[#253b4d] text-purple-300 transition"
                      >
                        <Gift className="w-3.5 h-3.5" />
                      </button>
                      {u.role !== 'ADMIN' && (
                        <>
                          <button
                            onClick={() => void handleToggleBan(u)}
                            title={u.isBanned ? 'Débannir' : 'Bannir'}
                            className={`p-1.5 rounded border transition ${
                              u.isBanned
                                ? 'bg-red-500/20 border-red-500 text-red-400'
                                : 'bg-[#0c1722] hover:bg-red-950 border-[#253b4d] text-slate-400 hover:text-red-400'
                            }`}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => void handleDeleteUser(u)}
                            title="Supprimer le compte"
                            className="p-1.5 rounded bg-[#0c1722] hover:bg-red-950 border border-[#253b4d] text-slate-400 hover:text-red-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contrôle Admin Chat Rain */}
      <div className="gaming-panel border border-sky-400/40 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black flex items-center gap-2 text-white">
              <CloudRain className="w-5 h-5 text-sky-400" />
              <span>Contrôle Chat Rain (Auto toutes les 3 min · 1 000–5 000 $)</span>
            </h2>
            <p className="text-xs text-[#b1bad3] mt-0.5">
              Forcez une Rain immédiate ou ajoutez du bonus dans le pot de la Rain en cours.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[2500, 10000, 50000, 100000].map((preset) => (
              <button
                key={preset}
                onClick={() => void handleForceRain(preset)}
                className="px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-400 text-sky-300 hover:text-[#071824] border border-sky-400/30 font-mono text-xs font-black transition"
              >
                Rain {preset.toLocaleString('fr-FR')} $
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="100"
            step="100"
            value={rainAmountInput}
            onChange={(e) => setRainAmountInput(e.target.value)}
            placeholder="Montant $"
            className="w-44 bg-[#0c1722] border border-[#253b4d] focus:border-sky-400 rounded-xl px-3.5 py-2.5 font-mono text-sm font-bold text-white focus:outline-none"
          />
          <button
            onClick={() => void handleForceRain()}
            className="px-4 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-[#071824] font-black text-xs transition"
          >
            Forcer une Rain Maintenant
          </button>
          <button
            onClick={() => void handleAddRainPot()}
            className="px-4 py-2.5 rounded-xl bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-black text-xs transition"
          >
            + Ajouter au Pot Actuel
          </button>
        </div>
      </div>

      {/* Modération Chat & Annonce Globale */}
      <div className="gaming-panel border border-[#253b4d] rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-sky-400" />
            <span>Modération Chat &amp; Annonces</span>
          </h2>
          <button
            onClick={() => void handleClearChat()}
            className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 text-xs font-bold transition"
          >
            Vider tout le Chat
          </button>
        </div>

        <form onSubmit={handleAnnounce} className="flex gap-2">
          <input
            type="text"
            value={announceText}
            onChange={(e) => setAnnounceText(e.target.value)}
            placeholder="Envoyer une annonce globale visible dans le Chat..."
            className="flex-1 bg-[#0c1722] border border-[#253b4d] focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#071824] font-black text-xs transition"
          >
            <Megaphone className="w-4 h-4" />
            <span>Annoncer</span>
          </button>
        </form>

        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {chatMessages.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 bg-[#0c1722] rounded-lg px-3 py-2 text-xs"
            >
              <div className="truncate">
                <span className="font-bold text-[#00e701] mr-2">{m.username}:</span>
                <span className="text-slate-200">{m.text}</span>
              </div>
              <button
                onClick={async () => {
                  await apiFetch(`/api/admin/chat/${m.id}`, { method: 'DELETE' });
                  setChatMessages((prev) => prev.filter((x) => x.id !== m.id));
                }}
                className="text-slate-500 hover:text-red-400 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modale Modifier Solde */}
      {balanceModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#14232f] border border-[#253b4d] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">Solde de {balanceModalUser.username}</h3>
              <button onClick={() => setBalanceModalUser(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['ADD', 'SUB', 'SET'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setBalanceMode(m)}
                  className={`py-2 rounded-lg text-xs font-extrabold border ${
                    balanceMode === m
                      ? 'bg-[#00e701]/20 border-[#00e701] text-[#00e701]'
                      : 'bg-[#0c1722] border-[#253b4d] text-[#b1bad3]'
                  }`}
                >
                  {m === 'ADD' ? 'Ajouter (+)' : m === 'SUB' ? 'Retirer (-)' : 'Définir (=)'}
                </button>
              ))}
            </div>

            <input
              type="number"
              step="1"
              min="0"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="w-full bg-[#0c1722] border border-[#253b4d] rounded-xl px-4 py-3 font-mono text-base font-bold text-white"
            />

            <button
              onClick={() =>
                void handleAdjustBalance(
                  balanceModalUser.id,
                  balanceMode,
                  creditsToCents(parseFloat(balanceInput) || 0)
                )
              }
              className="w-full py-3 rounded-xl btn-3d-green text-[#071824] font-black text-sm"
            >
              Appliquer immédiatement
            </button>
          </div>
        </div>
      )}

      {/* Modale Offrir un Skin CS2 */}
      {giftUser && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#14232f] border border-[#253b4d] rounded-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">Offrir un Skin CS2 à {giftUser.username}</h3>
              <button onClick={() => setGiftUser(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <input
              type="text"
              value={skinSearch}
              onChange={(e) => setSkinSearch(e.target.value)}
              placeholder="Rechercher un skin (Karambit, Butterfly, AWP, Vice...)"
              className="w-full bg-[#0c1722] border border-[#253b4d] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-400"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-y-auto flex-1 pr-1">
              {skinResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void handleGiveSkin(item)}
                  style={{ borderBottomColor: RARITIES[item.rarity].color }}
                  className="bg-[#0c1722] hover:bg-[#1a2c38] border border-[#253b4d] border-b-4 rounded-xl p-2.5 flex flex-col items-center text-center transition"
                >
                  <img src={item.imageUrl} alt={item.name} className="w-16 h-14 object-contain" />
                  <div className="text-[10px] text-slate-400 truncate w-full">{item.weaponOrCategory}</div>
                  <div className="text-xs font-bold text-white truncate w-full">{item.name}</div>
                  <div className="font-mono text-[11px] font-extrabold text-[#00e701]">
                    {formatCredits(item.value)} $
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
