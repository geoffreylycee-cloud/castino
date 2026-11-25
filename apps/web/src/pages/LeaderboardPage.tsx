import React, { useEffect, useState } from 'react';
import { Trophy, Flame, History } from 'lucide-react';
import { formatCredits, type BetHistoryDTO, type LeaderboardEntryDTO } from '@castino/shared';
import { apiFetch } from '../lib/api';

export const LeaderboardPage: React.FC = () => {
  const [tab, setTab] = useState<'balance' | 'wagered' | 'mybets'>('balance');
  const [byBalance, setByBalance] = useState<LeaderboardEntryDTO[]>([]);
  const [byWagered, setByWagered] = useState<LeaderboardEntryDTO[]>([]);
  const [myBets, setMyBets] = useState<BetHistoryDTO[]>([]);

  useEffect(() => {
    apiFetch<{
      byBalance: LeaderboardEntryDTO[];
      byWagered: LeaderboardEntryDTO[];
      myBets: BetHistoryDTO[];
    }>('/api/leaderboard')
      .then((res) => {
        setByBalance(res.byBalance);
        setByWagered(res.byWagered);
        setMyBets(res.myBets);
      })
      .catch(() => {});
  }, []);

  const activeRows = tab === 'balance' ? byBalance : byWagered;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2.5">
            <Trophy className="w-6 h-6 text-amber-400" />
            <span>Classement &amp; Historique</span>
          </h1>
          <p className="text-xs sm:text-sm text-stake-muted mt-1">
            Comparez votre solde et votre volume de jeu avec tous les joueurs du serveur.
          </p>
        </div>

        <div className="flex gap-1.5 bg-[#1a2c38] p-1.5 rounded-xl border border-[#2f4553]">
          <button
            onClick={() => setTab('balance')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              tab === 'balance' ? 'bg-[#00e701] text-[#071824]' : 'text-stake-muted hover:text-white'
            }`}
          >
            Top Solde
          </button>
          <button
            onClick={() => setTab('wagered')}
            className={`flex items-center gap-1 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              tab === 'wagered' ? 'bg-[#00e701] text-[#071824]' : 'text-stake-muted hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Volume Misé</span>
          </button>
          <button
            onClick={() => setTab('mybets')}
            className={`flex items-center gap-1 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              tab === 'mybets' ? 'bg-[#00e701] text-[#071824]' : 'text-stake-muted hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Mes Paris</span>
          </button>
        </div>
      </div>

      {tab !== 'mybets' ? (
        <div className="bg-[#1a2c38] border border-[#2f4553] rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#0f1923] text-stake-muted uppercase text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Rang</th>
                <th className="py-3.5 px-4">Joueur</th>
                <th className="py-3.5 px-4 text-right">Volume Misé</th>
                <th className="py-3.5 px-4 text-right">Solde Actuel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2f4553]/50">
              {activeRows.map((row) => (
                <tr key={row.id} className="hover:bg-[#213743]/60">
                  <td className="py-3.5 px-4 font-mono font-black">
                    {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-white">{row.username}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-stake-muted">
                    {formatCredits(row.totalWagered)} cr
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-extrabold text-[#00e701]">
                    {formatCredits(row.balance)} cr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-[#1a2c38] border border-[#2f4553] rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f1923] text-stake-muted uppercase text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Jeu</th>
                <th className="py-3.5 px-4">Nonce</th>
                <th className="py-3.5 px-4 text-right">Mise</th>
                <th className="py-3.5 px-4 text-right">Multiplicateur</th>
                <th className="py-3.5 px-4 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2f4553]/50">
              {myBets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stake-muted">
                    Vous n&apos;avez pas encore joué de manche.
                  </td>
                </tr>
              ) : (
                myBets.map((b) => (
                  <tr key={b.id} className="hover:bg-[#213743]/60">
                    <td className="py-3 px-4 font-bold">{b.gameType}</td>
                    <td className="py-3 px-4 font-mono text-stake-muted">
                      {b.nonceUsed !== null ? `#${b.nonceUsed}` : 'Live'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCredits(b.wager)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {b.multiplier.toFixed(2)}×
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-extrabold ${
                        b.profit >= 0 ? 'text-[#00e701]' : 'text-red-400'
                      }`}
                    >
                      {b.profit >= 0 ? '+' : ''}
                      {formatCredits(b.profit)} cr
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
