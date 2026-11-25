/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        stake: {
          bg: '#0f1923',
          surface: '#1a2c38',
          card: '#213743',
          hover: '#2f4553',
          border: '#2f4553',
          green: '#00e701',
          greenHover: '#1fff20',
          muted: '#b1bad3',
        },
        rarity: {
          common: '#4b69ff',
          uncommon: '#8847ff',
          rare: '#d32ce6',
          epic: '#eb4b4b',
          legendary: '#eab308',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 20px rgba(0, 231, 1, 0.35)',
        gold: '0 0 28px rgba(234, 179, 8, 0.45)',
      },
    },
  },
  plugins: [],
};
