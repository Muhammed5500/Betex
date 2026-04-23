import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        btx: {
          bg: '#0b0d12',
          panel: '#131720',
          border: '#1f2736',
          accent: '#6d8dff',
          accentDim: '#3b4b8a',
          success: '#3ecf8e',
          danger: '#ff5e7e',
          muted: '#6f7a90',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
