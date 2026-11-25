import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, RefreshCw, Calculator } from 'lucide-react';
import {
  calculateCrashPoint,
  generateMinePositions,
  rollCaseTicket,
  rollDiceOutcome,
  sha256Hex,
  type FairnessSeedInfoDTO,
  type RevealedSeedDTO,
} from '@castino/shared';
import { apiFetch } from '../../lib/api';
import { useUIStore } from '../../stores/useUIStore';

export const FairnessModal: React.FC = () => {
  const { fairnessModalOpen, closeFairnessModal, pushToast } = useUIStore();
  const [tab, setTab] = useState<'seeds' | 'verify'>('seeds');
  const [activeSeed, setActiveSeed] = useState<FairnessSeedInfoDTO | null>(null);
  const [history, setHistory] = useState<RevealedSeedDTO[]>([]);
  const [nextClientSeed, setNextClientSeed] = useState('');
  const [rotating, setRotating] = useState(false);

  // Vérificateur interactif
  const [vGame, setVGame] = useState<'DICE' | 'CASE' | 'MINES' | 'CRASH'>('DICE');
  const [vServerSeed, setVServerSeed] = useState('exemple_server_seed_secret_12345');
  const [vClientSeed, setVClientSeed] = useState('castino-player');
  const [vNonce, setVNonce] = useState(0);
  const [vMinesCount, setVMinesCount] = useState(3);

  useEffect(() => {
    if (!fairnessModalOpen) return;
    apiFetch<{ active: FairnessSeedInfoDTO; revealedHistory: RevealedSeedDTO[] }>(
      '/api/fairness/current'
    )
      .then((data) => {
        setActiveSeed(data.active);
        setHistory(data.revealedHistory);
        setNextClientSeed(data.active.clientSeed);
      })
      .catch(() => {});
  }, [fairnessModalOpen]);

  if (!fairnessModalOpen) return null;

  const handleRotate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRotating(true);
    try {
      const res = await apiFetch<{ active: FairnessSeedInfoDTO; revealed: RevealedSeedDTO }>(
        '/api/fairness/rotate',
        {
          method: 'POST',
          body: JSON.stringify({ clientSeed: nextClientSeed }),
        }
      );
      setActiveSeed(res.active);
      setHistory((prev) => [res.revealed, ...prev]);
      setVServerSeed(res.revealed.serverSeed);
      setVClientSeed(res.revealed.clientSeed);
      pushToast('Nouvelle paire de Seeds activée ! Ancienne Server Seed révélée.', 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Rotation impossible', 'error');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#1a2c38] border border-[#2f4553] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 bg-[#0f1923] border-b border-[#2f4553]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#00e701]" />
            <h2 className="text-base font-extrabold">Équité Prouvable (Provably Fair)</h2>
          </div>
          <button onClick={closeFairnessModal} className="text-stake-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#0f1923] rounded-lg">
            <button
              onClick={() => setTab('seeds')}
              className={`py-2 rounded-md text-xs font-bold transition ${
                tab === 'seeds' ? 'bg-[#213743] text-white' : 'text-stake-muted hover:text-white'
              }`}
            >
              Mes Graines (Seeds)
            </button>
            <button
              onClick={() => setTab('verify')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition ${
                tab === 'verify' ? 'bg-[#213743] text-white' : 'text-stake-muted hover:text-white'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Calculateur & Vérification</span>
            </button>
          </div>

          {tab === 'seeds' ? (
            <div className="space-y-4">
              <div className="bg-[#0f1923] border border-[#2f4553] rounded-xl p-4 space-y-3 text-xs">
                <div>
                  <span className="text-stake-muted font-semibold block mb-1">
                    Server Seed Actif (SHA-256 Hashé)
                  </span>
                  <div className="font-mono bg-[#213743] p-2.5 rounded break-all text-emerald-300">
                    {activeSeed?.serverSeedHash || '...'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-stake-muted font-semibold block mb-1">Client Seed Actif</span>
                    <div className="font-mono bg-[#213743] p-2.5 rounded text-white">
                      {activeSeed?.clientSeed || '...'}
                    </div>
                  </div>
                  <div>
                    <span className="text-stake-muted font-semibold block mb-1">
                      Nonce Actuel (Paris joués)
                    </span>
                    <div className="font-mono bg-[#213743] p-2.5 rounded text-white">
                      {activeSeed?.nonce ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              <form
                onSubmit={handleRotate}
                className="bg-[#213743] border border-[#2f4553] rounded-xl p-4 space-y-3"
              >
                <div className="text-xs font-bold text-white">
                  Changer de paire de Seeds (Révèle la Server Seed actuelle)
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nextClientSeed}
                    onChange={(e) => setNextClientSeed(e.target.value)}
                    placeholder="Nouveau Client Seed personnalisé"
                    className="flex-1 bg-[#0f1923] border border-[#2f4553] rounded-lg px-3 py-2 text-xs font-mono text-white"
                  />
                  <button
                    type="submit"
                    disabled={rotating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00e701] hover:bg-[#1fff20] text-[#071824] font-extrabold text-xs transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
                    <span>Changer</span>
                  </button>
                </div>
              </form>

              {history.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-stake-muted uppercase">
                    Anciennes Server Seeds révélées (Cliquez pour vérifier)
                  </h3>
                  {history.map((h) => (
                    <div
                      key={h.id}
                      onClick={() => {
                        setVServerSeed(h.serverSeed);
                        setVClientSeed(h.clientSeed);
                        setVNonce(Math.max(0, h.nonce - 1));
                        setTab('verify');
                      }}
                      className="cursor-pointer bg-[#0f1923] hover:bg-[#213743] border border-[#2f4553] rounded-lg p-3 text-xs space-y-1 transition"
                    >
                      <div className="flex justify-between text-stake-muted">
                        <span>Client Seed: <b className="text-white font-mono">{h.clientSeed}</b></span>
                        <span>{h.nonce} tirages</span>
                      </div>
                      <div className="font-mono text-[11px] text-[#00e701] break-all">
                        Server Seed: {h.serverSeed}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-4 gap-2">
                {(['DICE', 'CASE', 'MINES', 'CRASH'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setVGame(g)}
                    className={`py-2 rounded-lg font-bold border ${
                      vGame === g
                        ? 'bg-[#00e701]/20 border-[#00e701] text-[#00e701]'
                        : 'bg-[#0f1923] border-[#2f4553] text-stake-muted'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="space-y-3 bg-[#0f1923] p-4 rounded-xl border border-[#2f4553]">
                <div>
                  <label className="block text-stake-muted mb-1 font-semibold">Server Seed (clair)</label>
                  <input
                    type="text"
                    value={vServerSeed}
                    onChange={(e) => setVServerSeed(e.target.value)}
                    className="w-full bg-[#213743] border border-[#2f4553] rounded px-3 py-2 font-mono text-white"
                  />
                  <div className="text-[10px] text-slate-400 mt-1 font-mono break-all">
                    SHA-256 correspondant : {sha256Hex(vServerSeed)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stake-muted mb-1 font-semibold">
                      {vGame === 'CRASH' ? 'Public Seed du Round' : 'Client Seed'}
                    </label>
                    <input
                      type="text"
                      value={vClientSeed}
                      onChange={(e) => setVClientSeed(e.target.value)}
                      className="w-full bg-[#213743] border border-[#2f4553] rounded px-3 py-2 font-mono text-white"
                    />
                  </div>
                  {vGame !== 'CRASH' && (
                    <div>
                      <label className="block text-stake-muted mb-1 font-semibold">Nonce</label>
                      <input
                        type="number"
                        min={0}
                        value={vNonce}
                        onChange={(e) => setVNonce(Math.max(0, parseInt(e.target.value || '0', 10)))}
                        className="w-full bg-[#213743] border border-[#2f4553] rounded px-3 py-2 font-mono text-white"
                      />
                    </div>
                  )}
                </div>

                {vGame === 'MINES' && (
                  <div>
                    <label className="block text-stake-muted mb-1 font-semibold">Nombre de Mines</label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={vMinesCount}
                      onChange={(e) =>
                        setVMinesCount(Math.min(24, Math.max(1, parseInt(e.target.value || '3', 10))))
                      }
                      className="w-28 bg-[#213743] border border-[#2f4553] rounded px-3 py-1.5 font-mono text-white"
                    />
                  </div>
                )}
              </div>

              <div className="bg-[#213743] border border-[#00e701]/40 rounded-xl p-4">
                <div className="text-stake-muted font-semibold mb-1">Résultat Mathématique HMAC-SHA256 :</div>
                {vGame === 'DICE' && (
                  <div className="text-2xl font-mono font-black text-[#00e701]">
                    Roll = {rollDiceOutcome(vServerSeed, vClientSeed, vNonce).toFixed(2)}
                  </div>
                )}
                {vGame === 'CASE' && (
                  <div className="text-2xl font-mono font-black text-amber-400">
                    Ticket Caisse = #{rollCaseTicket(vServerSeed, vClientSeed, vNonce)} / 99 999
                  </div>
                )}
                {vGame === 'MINES' && (
                  <div className="font-mono text-sm font-bold text-red-400">
                    Positions des bombes (0–24) : [
                    {generateMinePositions(vServerSeed, vClientSeed, vNonce, vMinesCount).join(', ')}]
                  </div>
                )}
                {vGame === 'CRASH' && (
                  <div className="text-2xl font-mono font-black text-[#00e701]">
                    Crash Point = {calculateCrashPoint(vServerSeed, vClientSeed).toFixed(2)}x
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
