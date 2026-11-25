import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact }) => {
  return (
    <div className="flex items-center gap-2.5 select-none group">
      <svg
        viewBox="0 0 40 40"
        className="w-9 h-9 shrink-0 drop-shadow-[0_4px_10px_rgba(0,231,1,0.2)] transition-transform group-hover:scale-105"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logoPlate" x1="0" y1="0" x2="40" y2="40">
            <stop offset="0%" stopColor="#233a4b" />
            <stop offset="100%" stopColor="#0f1d29" />
          </linearGradient>
          <linearGradient id="logoAccent" x1="18" y1="12" x2="30" y2="28">
            <stop offset="0%" stopColor="#3bff3c" />
            <stop offset="100%" stopColor="#00c401" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="9" fill="url(#logoPlate)" stroke="#325066" strokeWidth="1.5" />
        {/* Monogramme C taillé en biseau */}
        <path
          d="M25.5 12H15.5L11 16.5V23.5L15.5 28H25.5"
          stroke="#ffffff"
          strokeWidth="3.4"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        {/* Pointe diamant émeraude */}
        <polygon points="21,15.5 29.5,20 21,24.5 23.2,20" fill="url(#logoAccent)" />
      </svg>

      {!compact && (
        <div className="flex flex-col">
          <span className="text-[20px] font-black tracking-tight text-white leading-none">
            Ca<span className="text-[#00e701]">STI</span>no
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#7f93a4] mt-0.5">
            Play Arena
          </span>
        </div>
      )}
    </div>
  );
};
