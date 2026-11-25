import React from 'react';

export type OriginalGameKey =
  | 'crash'
  | 'mines'
  | 'blackjack'
  | 'dice'
  | 'plinko'
  | 'limbo'
  | 'roulette'
  | 'keno'
  | 'hilo';

export const OriginalGameArt: React.FC<{ game: OriginalGameKey }> = ({ game }) => {
  switch (game) {
    case 'crash':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="crashBg" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06281e" />
              <stop offset="100%" stopColor="#0d5e3a" />
            </linearGradient>
            <linearGradient id="crashLine" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00e701" />
              <stop offset="100%" stopColor="#facc15" />
            </linearGradient>
            <linearGradient id="crashFill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00e701" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#00e701" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#crashBg)" />
          {/* Grid lines */}
          <g stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1">
            <line x1="0" y1="40" x2="220" y2="40" />
            <line x1="0" y1="80" x2="220" y2="80" />
            <line x1="0" y1="120" x2="220" y2="120" />
            <line x1="55" y1="0" x2="55" y2="150" />
            <line x1="110" y1="0" x2="110" y2="150" />
            <line x1="165" y1="0" x2="165" y2="150" />
          </g>
          {/* Rising area & curve */}
          <path d="M 18 134 Q 105 130, 168 38 L 168 134 Z" fill="url(#crashFill)" />
          <path
            d="M 18 134 Q 105 130, 168 38"
            fill="none"
            stroke="url(#crashLine)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Rocket */}
          <g transform="translate(168, 38) rotate(32)">
            <ellipse cx="0" cy="18" rx="6" ry="12" fill="#f97316" opacity="0.85" />
            <ellipse cx="0" cy="15" rx="3.5" ry="7" fill="#fef08a" />
            <path d="M0 -22 C11 -10, 11 6, 8 14 L-8 14 C-11 6, -11 -10, 0 -22 Z" fill="#ffffff" />
            <path d="M-8 6 L-15 16 L-7 14 Z" fill="#00e701" />
            <path d="M8 6 L15 16 L7 14 Z" fill="#00e701" />
            <circle cx="0" cy="-3" r="4.5" fill="#0f1923" stroke="#38bdf8" strokeWidth="2" />
          </g>
          <text x="26" y="42" fill="#00e701" fontFamily="monospace" fontWeight="900" fontSize="22" opacity="0.9">
            4.82×
          </text>
        </svg>
      );

    case 'mines':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="minesBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#092438" />
              <stop offset="100%" stopColor="#0f3d5e" />
            </linearGradient>
            <linearGradient id="gemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" />
              <stop offset="50%" stopColor="#00e701" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#minesBg)" />
          {/* Background tiles */}
          <rect x="28" y="24" width="46" height="46" rx="10" fill="#1b3446" stroke="#2f526b" strokeWidth="2" />
          <rect x="146" y="80" width="46" height="46" rx="10" fill="#1b3446" stroke="#2f526b" strokeWidth="2" />
          {/* Glowing Emerald Diamond Tile */}
          <rect x="34" y="54" width="66" height="66" rx="14" fill="#071824" stroke="#00e701" strokeWidth="2.5" />
          <polygon points="67,66 86,82 67,108 48,82" fill="url(#gemGrad)" />
          <polygon points="67,66 76,82 67,108 58,82" fill="#bbf7d0" opacity="0.45" />
          {/* Glowing Red Bomb Tile */}
          <rect x="116" y="26" width="66" height="66" rx="14" fill="#2c0b14" stroke="#ef4444" strokeWidth="2.5" />
          <circle cx="149" cy="61" r="17" fill="#ef4444" />
          <circle cx="143" cy="55" r="5" fill="#fca5a5" opacity="0.7" />
          <g stroke="#ef4444" strokeWidth="4" strokeLinecap="round">
            <line x1="149" y1="38" x2="149" y2="43" />
            <line x1="149" y1="79" x2="149" y2="84" />
            <line x1="126" y1="61" x2="131" y2="61" />
            <line x1="167" y1="61" x2="172" y2="61" />
            <line x1="133" y1="45" x2="137" y2="49" />
            <line x1="161" y1="73" x2="165" y2="77" />
            <line x1="165" y1="45" x2="161" y2="49" />
            <line x1="137" y1="73" x2="133" y2="77" />
          </g>
        </svg>
      );

    case 'blackjack':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="bjBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#261142" />
              <stop offset="100%" stopColor="#121e33" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#bjBg)" />
          <circle cx="110" cy="75" r="60" fill="#a855f7" opacity="0.18" />
          {/* Left Card A of Spades */}
          <g transform="translate(64, 24) rotate(-12)">
            <rect width="62" height="90" rx="10" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
            <text x="10" y="24" fill="#0f172a" fontWeight="900" fontSize="18" fontFamily="sans-serif">A</text>
            <text x="31" y="62" textAnchor="middle" fill="#0f172a" fontSize="34">♠</text>
          </g>
          {/* Right Card K of Hearts */}
          <g transform="translate(104, 28) rotate(12)">
            <rect width="62" height="90" rx="10" fill="#ffffff" stroke="#f8fafc" strokeWidth="2" />
            <text x="10" y="24" fill="#dc2626" fontWeight="900" fontSize="18" fontFamily="sans-serif">K</text>
            <text x="31" y="62" textAnchor="middle" fill="#dc2626" fontSize="34">♥</text>
          </g>
          {/* 21 Gold Badge */}
          <rect x="82" y="106" width="56" height="24" rx="12" fill="#eab308" />
          <text x="110" y="123" textAnchor="middle" fill="#0f1923" fontFamily="monospace" fontWeight="900" fontSize="14">
            BJ 21
          </text>
        </svg>
      );

    case 'dice':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="diceBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b2606" />
              <stop offset="100%" stopColor="#1c1917" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#diceBg)" />
          {/* Dice 1 */}
          <g transform="translate(56, 22) rotate(-14)">
            <rect width="56" height="56" rx="12" fill="#ffffff" stroke="#fde047" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="5" fill="#0f1923" />
            <circle cx="40" cy="16" r="5" fill="#0f1923" />
            <circle cx="28" cy="28" r="5" fill="#0f1923" />
            <circle cx="16" cy="40" r="5" fill="#0f1923" />
            <circle cx="40" cy="40" r="5" fill="#0f1923" />
          </g>
          {/* Dice 2 */}
          <g transform="translate(112, 34) rotate(14)">
            <rect width="56" height="56" rx="12" fill="#facc15" stroke="#ffffff" strokeWidth="2.5" />
            <circle cx="18" cy="18" r="5" fill="#0f1923" />
            <circle cx="38" cy="38" r="5" fill="#0f1923" />
            <circle cx="28" cy="28" r="5" fill="#0f1923" />
          </g>
          {/* Stake Slider bar */}
          <rect x="26" y="114" width="168" height="14" rx="7" fill="#ef4444" />
          <rect x="104" y="114" width="90" height="14" rx="7" fill="#00e701" />
          <rect x="96" y="108" width="16" height="26" rx="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
        </svg>
      );

    case 'plinko':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="plinkoBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3d0e33" />
              <stop offset="100%" stopColor="#14172b" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#plinkoBg)" />
          {/* Peg pyramid */}
          {[0, 1, 2, 3, 4].map((row) =>
            Array.from({ length: row + 3 }, (_, col) => {
              const x = 110 + (col - (row + 2) / 2) * 24;
              const y = 26 + row * 21;
              return <circle key={`${row}-${col}`} cx={x} cy={y} r="3.5" fill="#f8fafc" opacity="0.85" />;
            })
          )}
          {/* Falling glowing balls */}
          <circle cx="110" cy="18" r="7" fill="#ec4899" />
          <circle cx="122" cy="57" r="7" fill="#00e701" />
          <circle cx="144" cy="98" r="7" fill="#facc15" />
          {/* Bottom buckets */}
          <rect x="24" y="122" width="32" height="18" rx="5" fill="#ef4444" />
          <rect x="60" y="122" width="32" height="18" rx="5" fill="#f97316" />
          <rect x="96" y="122" width="28" height="18" rx="5" fill="#eab308" />
          <rect x="128" y="122" width="32" height="18" rx="5" fill="#f97316" />
          <rect x="164" y="122" width="32" height="18" rx="5" fill="#ef4444" />
          <text x="180" y="135" textAnchor="middle" fill="#0f1923" fontFamily="monospace" fontWeight="900" fontSize="9">
            1000×
          </text>
        </svg>
      );

    case 'limbo':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="limboBg" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3d1706" />
              <stop offset="100%" stopColor="#1b1429" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#limboBg)" />
          <circle cx="110" cy="75" r="56" fill="#f97316" opacity="0.16" />
          {/* Flame trail */}
          <path d="M98 118 L110 144 L122 118 Z" fill="#f97316" />
          <path d="M104 118 L110 134 L116 118 Z" fill="#fef08a" />
          {/* Vertical supersonic rocket */}
          <path d="M110 18 C126 38, 128 76, 122 114 L98 114 C92 76, 94 38, 110 18 Z" fill="#f8fafc" />
          <path d="M98 86 L80 116 L98 108 Z" fill="#f97316" />
          <path d="M122 86 L140 116 L122 108 Z" fill="#f97316" />
          <circle cx="110" cy="56" r="9" fill="#0f1923" stroke="#f97316" strokeWidth="3" />
          <text x="166" y="44" fill="#facc15" fontFamily="monospace" fontWeight="900" fontSize="18">
            100×
          </text>
        </svg>
      );

    case 'roulette':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="roulBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b0b12" />
              <stop offset="100%" stopColor="#141824" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#roulBg)" />
          {/* Roulette Wheel */}
          <circle cx="110" cy="75" r="56" fill="#1e293b" stroke="#eab308" strokeWidth="5" />
          <circle cx="110" cy="75" r="44" fill="none" stroke="#ef4444" strokeWidth="14" strokeDasharray="16 16" />
          <circle cx="110" cy="75" r="44" fill="none" stroke="#00e701" strokeWidth="14" strokeDasharray="14 264" transform="rotate(-90 110 75)" />
          <circle cx="110" cy="75" r="24" fill="#0f1923" stroke="#eab308" strokeWidth="3" />
          <circle cx="110" cy="75" r="8" fill="#eab308" />
          {/* Metallic Ball */}
          <circle cx="110" cy="31" r="6" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
        </svg>
      );

    case 'keno':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="kenoBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1d1b4b" />
              <stop offset="100%" stopColor="#101828" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#kenoBg)" />
          {/* 4x3 glowing tiles */}
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3].map((c) => {
              const x = 34 + c * 40;
              const y = 20 + r * 38;
              const isHit = (r === 0 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 0);
              const isPick = r === 1 && c === 1;
              return (
                <g key={`${r}-${c}`}>
                  <rect
                    x={x}
                    y={y}
                    width="32"
                    height="32"
                    rx="7"
                    fill={isHit ? '#00e701' : isPick ? '#8b5cf6' : '#21334a'}
                    stroke={isHit ? '#bbf7d0' : isPick ? '#c4b5fd' : '#334e6b'}
                    strokeWidth="1.5"
                  />
                  {isHit ? (
                    <polygon
                      points={`${x + 16},${y + 7} ${x + 24},${y + 15} ${x + 16},${y + 26} ${x + 8},${y + 15}`}
                      fill="#071824"
                    />
                  ) : (
                    <text
                      x={x + 16}
                      y={y + 21}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontFamily="monospace"
                      fontWeight="900"
                      fontSize="12"
                      opacity={isPick ? 1 : 0.6}
                    >
                      {r * 4 + c + 1}
                    </text>
                  )}
                </g>
              );
            })
          )}
        </svg>
      );

    case 'hilo':
      return (
        <svg viewBox="0 0 220 150" className="w-full h-full">
          <defs>
            <linearGradient id="hiloBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#08333a" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          <rect width="220" height="150" fill="url(#hiloBg)" />
          {/* Up Arrow */}
          <polygon points="46,44 64,74 28,74" fill="#00e701" />
          <rect x="40" y="74" width="12" height="24" rx="2" fill="#00e701" />
          {/* Center Ace Card */}
          <rect x="78" y="24" width="64" height="98" rx="10" fill="#ffffff" stroke="#2dd4bf" strokeWidth="2.5" />
          <text x="90" y="48" fill="#0f172a" fontWeight="900" fontSize="20">A</text>
          <text x="110" y="88" textAnchor="middle" fill="#0f172a" fontSize="38">♣</text>
          {/* Down Arrow */}
          <rect x="168" y="50" width="12" height="24" rx="2" fill="#38bdf8" />
          <polygon points="174,104 192,74 156,74" fill="#38bdf8" />
        </svg>
      );
  }
};
