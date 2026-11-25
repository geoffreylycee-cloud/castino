import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  Plus,
  ShieldCheck,
  Volume2,
  VolumeX,
  MessageSquare,
  User,
  LogOut,
  Clock,
} from 'lucide-react';
import { ECONOMY, formatCredits } from '@castino/shared';
import { BrandLogo } from '../common/BrandLogo';
import { apiFetch } from '../../lib/api';
import { sound } from '../../lib/sound';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { useRealtimeStore } from '../../stores/useRealtimeStore';

export const Topbar: React.FC = () => {
  const { user, setUser, logout } = useAuthStore();
  const {
    soundEnabled,
    toggleSound,
    rightPanelOpen,
    toggleRightPanel,
    openAuthModal,
    openFairnessModal,
    pushToast,
  } = useUIStore();
  const onlineCount = useRealtimeStore((s) => s.onlineCount);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    const computeRemaining = () => {
      if (!user?.lastFaucetAt) return 0;
      const elapsed = (Date.now() - new Date(user.lastFaucetAt).getTime()) / 1000;
      return Math.max(0, Math.ceil(ECONOMY.FAUCET_COOLDOWN_SECONDS - elapsed));
    };

    setCooldownLeft(computeRemaining());
    const timer = setInterval(() => {
      setCooldownLeft(computeRemaining());
    }, 1000);
    return () => clearInterval(timer);
  }, [user?.lastFaucetAt]);

  const underThreshold = (user?.balance ?? 0) < ECONOMY.FAUCET_MAX_BALANCE_THRESHOLD;
  const canClaimFaucet = underThreshold && cooldownLeft === 0;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFaucet = async () => {
    if (faucetLoading) return;
    setFaucetLoading(true);
    try {
      const res = await apiFetch<{ added: number; balance: number; user: NonNullable<typeof user> }>(
        '/api/wallet/faucet',
        { method: 'POST' }
      );
      setUser(res.user);
      sound.win();
      pushToast(`+${formatCredits(res.added)} $ ajoutés gratuitement !`, 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Faucet indisponible', 'error');
    } finally {
      setFaucetLoading(false);
    }
  };

  return (
    <header className="h-[64px] bg-[#14232f] border-b border-[#253b4d] px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30 shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
      {/* Gauche : Logo + Online */}
      <div className="flex items-center gap-4">
        <Link to="/">
          <BrandLogo />
        </Link>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0c1722] border border-[#223747] text-[11px] font-bold text-[#b1bad3]">
          <span className="w-2 h-2 rounded-full bg-[#00e701] shadow-[0_0_8px_#00e701]" />
          <span className="font-mono text-white tabular-nums">{onlineCount}</span>
          <span>en ligne</span>
        </div>
      </div>

      {/* Centre : Solde & Faucet 3D */}
      <div className="flex items-center bg-[#0c1722] rounded-xl p-1 border border-[#253b4d] shadow-inner">
        <div className="flex items-center gap-1.5 px-3.5 py-1.5">
          <span className="w-5 h-5 rounded-md bg-[#00e701]/15 border border-[#00e701]/30 flex items-center justify-center">
            <DollarSign className="w-3.5 h-3.5 text-[#00e701] stroke-[3]" />
          </span>
          <span className="font-mono font-extrabold text-sm sm:text-[15px] text-white tabular-nums">
            {formatCredits(user?.balance ?? 0)}
          </span>
        </div>

        <button
          onClick={handleFaucet}
          disabled={faucetLoading}
          title={
            cooldownLeft > 0
              ? `Prochain Faucet disponible dans ${formatTimer(cooldownLeft)}`
              : underThreshold
              ? 'Recharger +1 000,00 $ gratuits (toutes les 3 min)'
              : 'Disponible toutes les 3 min sous 100,00 $'
          }
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-extrabold text-xs sm:text-sm transition ${
            canClaimFaucet
              ? 'btn-3d-green text-[#071824]'
              : 'bg-[#1f3444] hover:bg-[#294356] text-[#d5e0ea] border border-[#2e495e]'
          }`}
        >
          {cooldownLeft > 0 ? (
            <>
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono tabular-nums">{formatTimer(cooldownLeft)}</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Faucet</span>
            </>
          )}
        </button>
      </div>

      {/* Droite */}
      <div className="flex items-center gap-2">
        <button
          onClick={openFairnessModal}
          title="Équité prouvable"
          className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1b2f3f] hover:bg-[#233c4f] border border-[#2a4357] text-xs font-bold text-[#d5e0ea] hover:text-white transition"
        >
          <ShieldCheck className="w-4 h-4 text-[#00e701]" />
          <span>Équité</span>
        </button>

        <button
          onClick={toggleSound}
          title={soundEnabled ? 'Couper les sons' : 'Activer les sons'}
          className="p-2 rounded-lg bg-[#1b2f3f] hover:bg-[#233c4f] border border-[#2a4357] text-[#b1bad3] hover:text-white transition"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-red-400" />}
        </button>

        {user?.isGuest ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => openAuthModal('login')}
              className="hidden sm:inline-flex px-3.5 py-2 rounded-lg bg-[#1b2f3f] hover:bg-[#233c4f] border border-[#2a4357] text-xs font-bold text-white transition"
            >
              Connexion
            </button>
            <button
              onClick={() => openAuthModal('register')}
              className="px-4 py-2 rounded-lg bg-[#1475e1] hover:bg-[#1e83f5] border-b-[3px] border-[#0c4f9c] active:border-b-0 active:translate-y-[2px] text-xs font-extrabold text-white transition"
            >
              Inscription
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-[#0c1722] border border-[#2a4357] rounded-lg px-3 py-1.5">
            <User className="w-3.5 h-3.5 text-[#00e701]" />
            <span className="text-xs font-bold max-w-[110px] truncate">{user?.username}</span>
            <button
              onClick={() => void logout()}
              title="Se déconnecter"
              className="text-[#b1bad3] hover:text-red-400 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <button
          onClick={toggleRightPanel}
          title="Live & Chat"
          className={`p-2 rounded-lg border transition ${
            rightPanelOpen
              ? 'bg-[#00e701]/15 border-[#00e701]/40 text-[#00e701]'
              : 'bg-[#1b2f3f] hover:bg-[#233c4f] border-[#2a4357] text-[#b1bad3] hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
