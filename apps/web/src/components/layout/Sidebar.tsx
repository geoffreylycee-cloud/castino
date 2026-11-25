import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  PackageOpen,
  Backpack,
  TrendingUp,
  Bomb,
  Dices,
  Spade,
  Triangle,
  Trophy,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Rocket,
  CircleDot,
  LayoutGrid,
  ArrowUpDown,
  Zap,
  Swords,
  ShieldAlert,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';

const mainLinks = [
  { to: '/', label: 'Accueil', icon: Home, end: true, color: 'text-white' },
  { to: '/cases', label: 'Caisses CS2', icon: PackageOpen, badge: '24', color: 'text-amber-400' },
  { to: '/battles', label: 'Case Battles', icon: Swords, badge: 'PVP', color: 'text-rose-400' },
  { to: '/upgrader', label: 'Upgrader', icon: Zap, color: 'text-purple-400' },
  { to: '/inventory', label: 'Inventaire', icon: Backpack, color: 'text-sky-400' },
  { to: '/leaderboard', label: 'Classement', icon: Trophy, color: 'text-yellow-400' },
];

const originalsLinks = [
  { to: '/games/crash', label: 'Crash', icon: TrendingUp, badge: 'LIVE' },
  { to: '/games/mines', label: 'Mines', icon: Bomb },
  { to: '/games/blackjack', label: 'Blackjack', icon: Spade },
  { to: '/games/dice', label: 'Dice', icon: Dices },
  { to: '/games/plinko', label: 'Plinko', icon: Triangle },
  { to: '/games/limbo', label: 'Limbo', icon: Rocket },
  { to: '/games/roulette', label: 'Roulette', icon: CircleDot, badge: 'LIVE' },
  { to: '/games/keno', label: 'Keno', icon: LayoutGrid },
  { to: '/games/hilo', label: 'HiLo', icon: ArrowUpDown },
];

export const Sidebar: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar, openFairnessModal } = useUIStore();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  return (
    <aside
      className={`hidden md:flex flex-col bg-[#101e29] border-r border-[#213545] transition-all duration-200 shrink-0 ${
        sidebarCollapsed ? 'w-[70px]' : 'w-[236px]'
      }`}
    >
      <div className="px-3 py-3 flex items-center justify-between border-b border-[#1c2f3d]">
        {!sidebarCollapsed && (
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#7f93a4] px-2">
            CS2 &amp; Casino
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg bg-[#192b39] hover:bg-[#22394b] border border-[#274054] text-[#b1bad3] hover:text-white mx-auto md:mx-0 transition"
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2.5 space-y-6">
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-black border transition ${
                isActive
                  ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                  : 'bg-amber-400/10 border-amber-400/30 text-amber-300 hover:bg-amber-400/20'
              }`
            }
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              {!sidebarCollapsed && <span>Admin Panel</span>}
            </div>
            {!sidebarCollapsed && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-[#071824]">
                ADMIN
              </span>
            )}
          </NavLink>
        )}

        <nav className="space-y-1">
          {mainLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-bold transition ${
                    isActive
                      ? 'bg-[#1c3141] text-white border-l-[3px] border-[#00e701] shadow-sm'
                      : 'text-[#b1bad3] hover:bg-[#172836] hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${item.color}`} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </div>
                {!sidebarCollapsed && item.badge && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#243b4d] text-white border border-white/[0.06]">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div>
          {!sidebarCollapsed && (
            <div className="px-3 mb-2 text-[11px] font-extrabold uppercase tracking-widest text-[#7f93a4]">
              Originals
            </div>
          )}
          <nav className="space-y-1">
            {originalsLinks.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-bold transition ${
                      isActive
                        ? 'bg-[#1c3141] text-white border-l-[3px] border-[#00e701] shadow-sm'
                        : 'text-[#b1bad3] hover:bg-[#172836] hover:text-white'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0 text-[#00e701]" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && item.badge && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#00e701]/15 text-[#00e701] border border-[#00e701]/30">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="p-3 border-t border-[#1c2f3d]">
        <button
          onClick={openFairnessModal}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#192b39] hover:bg-[#22394b] border border-[#274054] text-xs font-bold text-[#d5e0ea] hover:text-white transition"
        >
          <ShieldCheck className="w-4 h-4 text-[#00e701] shrink-0" />
          {!sidebarCollapsed && <span>Provably Fair</span>}
        </button>
      </div>
    </aside>
  );
};
