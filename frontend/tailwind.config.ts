import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#08060f',
        surface: '#13101f',
        surfaceHi: '#1b1530',
        border: '#2a2142',
        borderHi: '#3a2d5e',
        text: '#f1eefa',
        muted: '#8a82a8',
        mutedHi: '#b0a8c8',

        // Monad primary
        purple: '#836ef9',
        purpleHi: '#a594ff',
        purpleDim: '#3c2d6b',

        // Accents
        magenta: '#f06bc4',
        cyan: '#4ed9ff',
        lime: '#a8ff5e',

        // State
        success: '#00d89b',
        danger: '#ff5877',
        warning: '#ffb547',

        // Token brand
        monToken: '#836ef9',
        usdcToken: '#4ed9ff',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo'],
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
      },
      backgroundImage: {
        'gradient-cta': 'linear-gradient(135deg, #836ef9 0%, #f06bc4 100%)',
        'gradient-cta-hover': 'linear-gradient(135deg, #a594ff 0%, #ff7ad2 100%)',
        'gradient-brand': 'linear-gradient(135deg, #836ef9 0%, #4ed9ff 100%)',
        'gradient-surface': 'linear-gradient(180deg, #1b1530 0%, #13101f 100%)',
      },
      boxShadow: {
        'glow-purple': '0 0 40px rgba(131, 110, 249, 0.25)',
        'glow-purple-lg': '0 0 80px rgba(131, 110, 249, 0.4)',
        'glow-magenta': '0 0 30px rgba(240, 107, 196, 0.3)',
      },
    },
  },
  plugins: [],
};

export default config;
