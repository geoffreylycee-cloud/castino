import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, Crown, Gift, PackageOpen, Search } from 'lucide-react';
import { RARITIES, formatCredits, type CaseDTO } from '@castino/shared';
import { apiFetch } from '../lib/api';

const CATEGORIES = [
  { key: 'all', label: 'Toutes (24)' },
  { key: 'free-budget', label: 'Gratuit & Budget ($0–$4)' },
  { key: 'classic', label: 'Classiques ($6–$50)' },
  { key: 'premium', label: 'Premium ($75–$1K)' },
  { key: 'high-roller', label: 'High Roller ($2.5K–$25K)' },
  { key: 'whale', label: 'VIP Légende ($50K–$100K)' },
];

const TIER_STYLES: Record<string, { glow: string; badge: string; border: string }> = {
  'free-budget': {
    glow: 'from-[#00e701]/20 via-[#182a36] to-[#111e28]',
    badge: 'bg-[#00e701]/15 text-[#00e701] border-[#00e701]/30',
    border: 'hover:border-[#00e701]/60',
  },
  classic: {
    glow: 'from-sky-500/20 via-[#182a36] to-[#111e28]',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    border: 'hover:border-sky-400/60',
  },
  premium: {
    glow: 'from-purple-500/20 via-[#182a36] to-[#111e28]',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    border: 'hover:border-purple-400/60',
  },
  'high-roller': {
    glow: 'from-red-500/25 via-[#182a36] to-[#111e28]',
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    border: 'hover:border-red-400/60',
  },
  whale: {
    glow: 'from-amber-400/30 via-[#212b2f] to-[#111e28]',
    badge: 'bg-amber-400/20 text-amber-300 border-amber-400/40',
    border: 'hover:border-amber-400',
  },
};

export const CasesLobbyPage: React.FC = () => {
  const [cases, setCases] = useState<CaseDTO[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ cases: CaseDTO[] }>('/api/cases')
      .then((res) => setCases(res.cases))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases
      .filter((c) => (category === 'all' ? true : c.category === category))
      .filter((c) => (!q ? true : c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)))
      .sort((a, b) => (sortDir === 'asc' ? a.price - b.price : b.price - a.price));
  }, [cases, category, search, sortDir]);

  return (
    <div className="space-y-6">
      {/* Header & Outils de recherche */}
      <div className="bg-[#13212c]/80 border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2.5">
              <PackageOpen className="w-7 h-7 text-amber-400" />
              <span>Caisses CS2 Officielles</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              24 caisses authentiques de <b className="text-[#00e701]">0 $ (Gratuit)</b> jusqu&apos;à{' '}
              <b className="text-amber-400">100 000 $</b> · Skins, Couteaux &amp; Gants officiels Steam.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une caisse..."
                className="w-full bg-[#0b141c] border border-white/[0.09] focus:border-[#00e701] rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#0b141c] hover:bg-[#1a2c38] border border-white/[0.09] text-xs font-bold text-slate-200 transition shrink-0"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#00e701]" />
              <span>{sortDir === 'asc' ? 'Prix ↑' : 'Prix ↓'}</span>
            </button>
          </div>
        </div>

        {/* Filtres par palier de prix */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition ${
                category === cat.key
                  ? 'bg-[#00e701] text-[#071824] border-[#00e701] shadow-[0_0_15px_rgba(0,231,1,0.28)]'
                  : 'bg-[#0b141c] border-white/[0.07] text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grille des Caisses */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, n) => (
            <div key={n} className="h-72 rounded-2xl bg-[#13212c] animate-pulse border border-white/[0.06]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((c) => {
            const tier = TIER_STYLES[c.category] || TIER_STYLES.classic;
            const uniqueRarities = Array.from(new Set((c.items || []).map((i) => i.item.rarity)));
            const isFree = c.price === 0;
            const isWhale = c.category === 'whale';

            return (
              <Link
                key={c.id}
                to={`/cases/${c.slug}`}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-b ${tier.glow} border border-white/[0.08] ${tier.border} p-5 flex flex-col items-center text-center transition-all duration-200 hover:-translate-y-1.5 shadow-xl`}
              >
                {/* Badge haut */}
                <div className="w-full flex items-center justify-between mb-1">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${tier.badge}`}
                  >
                    {isFree && <Gift className="w-3 h-3" />}
                    {isWhale && <Crown className="w-3 h-3" />}
                    {isFree ? 'Gratuit' : isWhale ? 'VIP Légende' : `${c.items?.length || 0} skins`}
                  </span>
                  <div className="flex items-center gap-1">
                    {uniqueRarities.map((r) => (
                      <span
                        key={r}
                        style={{ backgroundColor: RARITIES[r].color }}
                        className="w-2 h-2 rounded-full"
                      />
                    ))}
                  </div>
                </div>

                {/* Image officielle de la caisse CS2 */}
                <div className="relative my-2 flex items-center justify-center h-32">
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    loading="lazy"
                    className="w-36 h-32 object-contain drop-shadow-[0_14px_22px_rgba(0,0,0,0.55)] group-hover:scale-110 transition-transform duration-300"
                  />
                </div>

                <h2 className="text-base font-black text-white group-hover:text-[#00e701] transition-colors line-clamp-1">
                  {c.name}
                </h2>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                  {c.description}
                </p>

                <div
                  className={`mt-4 w-full py-2.5 rounded-xl font-mono font-extrabold text-sm tabular-nums border transition ${
                    isFree
                      ? 'bg-[#00e701] text-[#071824] border-[#00e701] shadow-[0_0_16px_rgba(0,231,1,0.3)]'
                      : isWhale
                      ? 'bg-amber-400/15 text-amber-300 border-amber-400/40 group-hover:bg-amber-400 group-hover:text-[#071824]'
                      : 'bg-[#0b141c] text-[#00e701] border-white/[0.08] group-hover:bg-[#00e701] group-hover:text-[#071824] group-hover:border-[#00e701]'
                  }`}
                >
                  {isFree ? 'OUVRIR · 0,00 $' : `${formatCredits(c.price)} $`}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
