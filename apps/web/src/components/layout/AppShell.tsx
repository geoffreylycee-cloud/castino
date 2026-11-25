import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, PackageOpen, TrendingUp, Bomb, Spade, Backpack } from 'lucide-react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { AuthModal } from './AuthModal';
import { FairnessModal } from '../fairness/FairnessModal';
import { useUIStore } from '../../stores/useUIStore';

export const AppShell: React.FC = () => {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="min-h-screen flex flex-col text-white">
      <Topbar />

      <div className="flex-1 flex min-h-0">
        <Sidebar />

        <main className="flex-1 min-w-0 overflow-y-auto pb-20 md:pb-8">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>

        <RightPanel />
      </div>

      {/* Navigation mobile inférieure */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 h-16 bg-[#1a2c38] border-t border-[#2f4553] grid grid-cols-6 z-30">
        {[
          { to: '/', label: 'Accueil', icon: Home, end: true },
          { to: '/cases', label: 'Cases', icon: PackageOpen },
          { to: '/games/crash', label: 'Crash', icon: TrendingUp },
          { to: '/games/mines', label: 'Mines', icon: Bomb },
          { to: '/games/blackjack', label: 'BJ', icon: Spade },
          { to: '/inventory', label: 'Sac', icon: Backpack },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 text-[10px] font-bold ${
                  isActive ? 'text-[#00e701]' : 'text-stake-muted'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Notifications Toasts */}
      <div className="fixed bottom-20 md:bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            className={`cursor-pointer px-4 py-3 rounded-xl shadow-xl border text-xs font-bold flex items-center gap-2 transition ${
              t.type === 'success'
                ? 'bg-[#1a2c38] border-[#00e701] text-[#00e701]'
                : t.type === 'error'
                ? 'bg-[#1a2c38] border-red-500 text-red-400'
                : 'bg-[#1a2c38] border-[#2f4553] text-white'
            }`}
          >
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      <AuthModal />
      <FairnessModal />
    </div>
  );
};
