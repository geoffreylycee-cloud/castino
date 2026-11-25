import React from 'react';
import { Coins } from 'lucide-react';
import { ECONOMY, centsToCredits, creditsToCents } from '@castino/shared';
import { useAuthStore } from '../../stores/useAuthStore';
import { sound } from '../../lib/sound';

interface WagerInputProps {
  wagerCents: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
}

export const WagerInput: React.FC<WagerInputProps> = ({ wagerCents, onChange, disabled }) => {
  const balance = useAuthStore((s) => s.user?.balance ?? 0);
  const creditsValue = centsToCredits(wagerCents);

  const applyCents = (raw: number) => {
    const maxAllowed = Math.max(ECONOMY.MIN_WAGER, Math.min(balance || ECONOMY.MAX_WAGER, ECONOMY.MAX_WAGER));
    const clamped = Math.max(ECONOMY.MIN_WAGER, Math.min(Math.round(raw), maxAllowed));
    onChange(clamped);
  };

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-stake-muted mb-1.5">
        <span>Montant de la mise</span>
        <span className="font-mono text-[11px] text-slate-400">
          Max: {(balance / 100).toFixed(2)} cr
        </span>
      </div>
      <div className="flex items-center bg-[#0f1923] border-2 border-[#2f4553] focus-within:border-[#557086] rounded-lg overflow-hidden transition-colors">
        <div className="pl-3 pr-2 text-[#00e701]">
          <Coins className="w-4 h-4" />
        </div>
        <input
          type="number"
          step="0.1"
          min="0.1"
          disabled={disabled}
          value={Number.isNaN(creditsValue) ? '' : creditsValue}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (Number.isNaN(val)) {
              onChange(ECONOMY.MIN_WAGER);
            } else {
              onChange(Math.max(ECONOMY.MIN_WAGER, creditsToCents(val)));
            }
          }}
          className="w-full bg-transparent py-2.5 pr-2 text-sm font-mono font-bold text-white focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center bg-[#213743] p-1 gap-1 border-l border-[#2f4553]">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              sound.click();
              applyCents(wagerCents / 2);
            }}
            className="px-2.5 py-1.5 text-xs font-bold bg-[#2f4553] hover:bg-[#3d5a6c] rounded text-white transition disabled:opacity-40"
          >
            ½
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              sound.click();
              applyCents(wagerCents * 2);
            }}
            className="px-2.5 py-1.5 text-xs font-bold bg-[#2f4553] hover:bg-[#3d5a6c] rounded text-white transition disabled:opacity-40"
          >
            2×
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              sound.click();
              applyCents(balance);
            }}
            className="px-2.5 py-1.5 text-xs font-bold bg-[#2f4553] hover:bg-[#3d5a6c] rounded text-[#00e701] transition disabled:opacity-40"
          >
            Max
          </button>
        </div>
      </div>
    </div>
  );
};
