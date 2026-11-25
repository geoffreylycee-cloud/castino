import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PackageOpen,
  ArrowRight,
  Swords,
  Zap,
  Flame,
  History,
  Crown,
} from 'lucide-react';
import { formatCredits, type BetHistoryDTO, type CaseDTO } from '@castino/shared';
import { OriginalGameArt, type OriginalGameKey } from '../components/games/OriginalGameArt';
import { apiFetch } from '../lib/api';

const ORIGINALS: {
  key: OriginalGameKey;
  to: string;
  name: string;
  tag: string;
  hoverRing: string;
}[] = [
  { key: 'crash', to: '/games/crash', name: 'Crash', tag: 'LIVE', hoverRing: 'hover:border-[#00e701]' },
  { key: 'mines', to: '/games/mines', name: 'Mines', tag: '99% RTP', hoverRing: 'hover:border-sky-400' },
  { key: 'blackjack', to: '/games/blackjack', name: 'Blackjack', tag: '3:2', hoverRing: 'hover:border-purple-400' },
  { key: 'dice', to: '/games/dice', name: 'Dice', tag: 'FAST', hoverRing: 'hover:border-amber-400' },
  { key: 'plinko', to: '/games/plinko', name: 'Plinko', tag: '1000×', hoverRing: 'hover:border-pink-400' },
  { key: 'limbo', to: '/games/limbo', name: 'Limbo', tag: '1M× MAX', hoverRing: 'hover:border-orange-400' },
  { key: 'roulette', to: '/games/roulette', name: 'Roulette', tag: '36×', hoverRing: 'hover:border-red-400' },
  { key: 'keno', to: '/games/keno', name: 'Keno', tag: '40 CASES', hoverRing: 'hover:border-indigo-400' },
  { key: 'hilo', to: '/games/hilo', name: 'HiLo', tag: 'SÉRIE', hoverRing: 'hover:border-teal-400' },
];

export const HomePage: React.FC = () => {
  const [cases, setCases] = useState<CaseDTO[]>([]);
  const [recentBets, setRecentBets] = useState<BetHistoryDTO[]>([]);

  useEffect(() => {
    apiFetch<{ cases: CaseDTO[] }>('/api/cases')
      .then((d) => {
        const featuredSlugs = [
          'free-prisma-case',
          'kilowatt-case',
          'operation-bravo-case',
          'csgo-weapon-case',
        ];
        const picked = featuredSlugs
          .map((s) => d.cases.find((c) => c.slug === s))
          .filter((c): c is CaseDTO => Boolean(c));
        setCases(picked.length > 0 ? picked : d.cases.slice(0, 4));
      })
      .catch(() => {});
    apiFetch<{ recentBets: BetHistoryDTO[] }>('/api/leaderboard')
      .then((d) => setRecentBets(d.recentBets.slice(0, 10)))
      .catch(() => {});
  }, []);

  const heroCaseImg = cases.find((c) => c.slug === 'kilowatt-case')?.imageUrl || cases[0]?.imageUrl;
  const whaleCaseImg = cases.find((c) => c.slug === 'csgo-weapon-case')?.imageUrl || cases[3]?.imageUrl;
  const bravoCaseImg = cases.find((c) => c.slug === 'operation-bravo-case')?.imageUrl || cases[2]?.imageUrl;

  return (
    <div className="space-y-9">
      {/* 3 Bannières Visuelles CS2 (Style CSGORoll / Clash.gg avec vrais visuels de caisses) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Carte 1 : Case Opening */}
        <Link
          to="/cases"
          className="group relative overflow-hidden rounded-2xl gaming-panel border border-[#284052] hover:border-[#00e701] p-5 min-h-[156px] flex flex-col justify-between transition-all hover:-translate-y-1"
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#00e701] via-emerald-400 to-transparent" />
          <div className="relative z-10 max-w-[65%] space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-[#00e701]/15 text-[#00e701] border border-[#00e701]/30">
              <PackageOpen className="w-3 h-3" /> 24 Caisses CS2
            </span>
            <h2 className="text-xl font-black text-white leading-tight">Case Opening</h2>
            <p className="text-xs text-[#b1bad3]">De 0 $ (Gratuit) jusqu&apos;à 100 000 $</p>
          </div>

          <div className="relative z-10 mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold text-[#00e701] group-hover:translate-x-1 transition-transform">
            <span>Ouvrir une caisse</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>

          {heroCaseImg && (
            <img
              src={heroCaseImg}
              alt="CS2 Case"
              className="pointer-events-none absolute -right-3 -bottom-2 w-36 h-32 object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.65)] group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300"
            />
          )}
        </Link>

        {/* Carte 2 : Case Battles PvP */}
        <Link
          to="/battles"
          className="group relative overflow-hidden rounded-2xl gaming-panel border border-[#284052] hover:border-amber-400 p-5 min-h-[156px] flex flex-col justify-between transition-all hover:-translate-y-1"
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400 via-orange-500 to-transparent" />
          <div className="relative z-10 max-w-[65%] space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
              <Swords className="w-3 h-3" /> PvP &amp; Bots
            </span>
            <h2 className="text-xl font-black text-white leading-tight">Case Battles</h2>
            <p className="text-xs text-[#b1bad3]">1v1 · 1v1v1 · 2v2 · 3v3 · Reverse</p>
          </div>

          <div className="relative z-10 mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-300 group-hover:translate-x-1 transition-transform">
            <span>Rejoindre l&apos;arène</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>

          {bravoCaseImg && (
            <img
              src={bravoCaseImg}
              alt="Battle Case"
              className="pointer-events-none absolute -right-3 -bottom-2 w-36 h-32 object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.65)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300"
            />
          )}
        </Link>

        {/* Carte 3 : Skin Upgrader */}
        <Link
          to="/upgrader"
          className="group relative overflow-hidden rounded-2xl gaming-panel border border-[#284052] hover:border-purple-400 p-5 min-h-[156px] flex flex-col justify-between transition-all hover:-translate-y-1"
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-purple-400 via-fuchsia-500 to-transparent" />
          <div className="relative z-10 max-w-[65%] space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
              <Zap className="w-3 h-3" /> 480 Skins CS2
            </span>
            <h2 className="text-xl font-black text-white leading-tight">Skin Upgrader</h2>
            <p className="text-xs text-[#b1bad3]">Tentez jusqu&apos;à 10× vos skins</p>
          </div>

          <div className="relative z-10 mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold text-purple-300 group-hover:translate-x-1 transition-transform">
            <span>Upgrader un skin</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>

          {whaleCaseImg && (
            <img
              src={whaleCaseImg}
              alt="Upgrader"
              className="pointer-events-none absolute -right-3 -bottom-2 w-36 h-32 object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.65)] group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300"
            />
          )}
        </Link>
      </section>

      {/* CaSTIno Originals (Cartes Poster riches style Stake) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2 text-white">
            <Flame className="w-5 h-5 text-[#00e701]" />
            <span>CaSTIno Originals</span>
          </h2>
          <span className="text-xs font-bold text-[#7f93a4] uppercase tracking-wider">
            9 Jeux · Provably Fair
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {ORIGINALS.map((g) => (
            <Link
              key={g.to}
              to={g.to}
              className={`group relative rounded-2xl overflow-hidden bg-[#152430] border-2 border-[#233849] ${g.hoverRing} transition-all duration-200 hover:-translate-y-1.5 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.6)]`}
            >
              <div className="relative h-36 w-full overflow-hidden">
                <div className="w-full h-full group-hover:scale-110 transition-transform duration-300">
                  <OriginalGameArt game={g.key} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#111e28] via-[#111e28]/70 to-transparent" />
                <span className="absolute top-2.5 left-2.5 text-[9px] font-black tracking-wider px-2 py-0.5 rounded-md bg-[#0c1722]/90 text-white border border-white/10">
                  {g.tag}
                </span>
                <div className="absolute bottom-2.5 inset-x-3 flex items-end justify-between">
                  <span className="text-base font-black text-white tracking-tight drop-shadow">
                    {g.name}
                  </span>
                  <span className="w-6 h-6 rounded-full bg-white/10 group-hover:bg-[#00e701] group-hover:text-[#071824] flex items-center justify-center transition-colors">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Caisses CS2 Vedettes */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2 text-white">
            <Crown className="w-5 h-5 text-amber-400" />
            <span>Caisses CS2 Vedettes</span>
          </h2>
          <Link
            to="/cases"
            className="text-xs font-extrabold text-[#00e701] hover:underline inline-flex items-center gap-1"
          >
            <span>Voir les 24 caisses</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cases.map((c) => {
            const isFree = c.price === 0;
            const isWhale = c.price >= 5_000_000;
            return (
              <Link
                key={c.id}
                to={`/cases/${c.slug}`}
                className={`group gaming-panel rounded-2xl border border-[#253b4d] ${
                  isWhale ? 'hover:border-amber-400' : 'hover:border-[#00e701]'
                } p-5 flex flex-col items-center text-center transition-all hover:-translate-y-1`}
              >
                <img
                  src={c.imageUrl}
                  alt={c.name}
                  className="w-36 h-32 object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-300"
                />
                <h3 className="text-sm font-extrabold text-white mt-2 truncate w-full">{c.name}</h3>
                <div
                  className={`mt-3 w-full py-2 rounded-xl font-mono text-xs font-black tabular-nums border transition ${
                    isFree
                      ? 'bg-[#00e701] text-[#071824] border-[#00e701]'
                      : isWhale
                      ? 'bg-amber-400/15 text-amber-300 border-amber-400/40 group-hover:bg-amber-400 group-hover:text-[#071824]'
                      : 'bg-[#0c1722] text-[#00e701] border-[#253b4d] group-hover:bg-[#00e701] group-hover:text-[#071824]'
                  }`}
                >
                  {isFree ? 'GRATUIT · 0,00 $' : `${formatCredits(c.price)} $`}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Tableau des derniers paris */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black flex items-center gap-2 text-white">
            <History className="w-4 h-4 text-[#00e701]" />
            <span>Derniers Paris en Direct</span>
          </h2>
          <Link to="/leaderboard" className="text-xs font-bold text-[#b1bad3] hover:text-white">
            Classement complet →
          </Link>
        </div>

        <div className="gaming-panel border border-[#253b4d] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0c1722] text-[#7f93a4] uppercase text-[10px] tracking-wider font-extrabold">
                <tr>
                  <th className="py-3.5 px-4">Jeu</th>
                  <th className="py-3.5 px-4">Joueur</th>
                  <th className="py-3.5 px-4 text-right">Mise</th>
                  <th className="py-3.5 px-4 text-right">Multiplicateur</th>
                  <th className="py-3.5 px-4 text-right">Gain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#223545]">
                {recentBets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#b1bad3]">
                      Aucun pari enregistré pour l&apos;instant.
                    </td>
                  </tr>
                ) : (
                  recentBets.map((b) => (
                    <tr key={b.id} className="hover:bg-[#1e3343]/70 transition-colors">
                      <td className="py-3 px-4 font-extrabold text-white">{b.gameType}</td>
                      <td className="py-3 px-4 font-semibold text-[#b1bad3]">{b.username}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatCredits(b.wager)} $
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                        {b.multiplier.toFixed(2)}×
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-extrabold tabular-nums ${
                          b.payout >= b.wager ? 'text-[#00e701]' : 'text-[#7f93a4]'
                        }`}
                      >
                        {formatCredits(b.payout)} $
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
