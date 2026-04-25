import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paper-feel palette — Lab Notebook concept.
        bg: '#fbf8ee',          // cream paper
        bgSoft: '#f5f1e2',      // slightly darker (for footer / inset)
        surface: '#ffffff',     // bright white card (used sparingly)
        surfaceWarm: '#f8f4e6', // creamy elevated surface
        border: '#d9d3bf',      // warm beige border
        borderHi: '#a89d75',    // active border / rule

        // Ink tonal ramp.
        text: '#1a1a1a',        // body ink
        textHi: '#0a0a0a',      // emphasised
        muted: '#5a5648',       // warm gray-ink
        mutedHi: '#3d3a30',
        dim: '#9a8f72',

        // Ink colors (functional + decorative).
        ink: '#3b3a8a',         // marginalia / handwritten notes (blue-violet pen)
        marker: '#c1272d',      // red marker / annotations
        highlighter: '#fff3a3', // soft yellow highlight bg

        // Single brand accent — Monad purple, used only where brand-explicit.
        purple: '#6d5be0',
        purpleHi: '#5848c8',
        purpleDim: '#e8e3fb',

        // State.
        success: '#3a7d44',
        danger: '#c1272d',
        warning: '#a8861f',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo'],
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'Cambria', 'ui-serif', 'serif'],
        hand: ['var(--font-caveat)', '"Bradley Hand"', '"Segoe Script"', 'cursive'],
      },
      fontSize: {
        'display-xl': ['clamp(2.75rem, 6vw, 4.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(2.25rem, 4.5vw, 3.25rem)', { lineHeight: '1.08', letterSpacing: '-0.018em' }],
        display: ['clamp(1.625rem, 3vw, 2.25rem)', { lineHeight: '1.15', letterSpacing: '-0.012em' }],
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.16em' }],
        marginal: ['0.875rem', { lineHeight: '1.45' }],
        hand: ['1.125rem', { lineHeight: '1.3' }],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '3px',
        md: '4px',
        lg: '6px',
        xl: '8px',
      },
      backgroundImage: {
        // 24px dot grid — calibrated to look like graph paper, not pixel art.
        'dot-grid':
          'radial-gradient(circle at 1px 1px, rgba(26, 26, 26, 0.085) 1px, transparent 0)',
      },
      backgroundSize: {
        'dot-grid': '24px 24px',
      },
      boxShadow: {
        // Soft "lifted paper" shadows — Lab Notebook 3D feel.
        'soft':    '0 1px 2px rgba(26, 24, 14, 0.04), 0 6px 18px rgba(26, 24, 14, 0.06)',
        'soft-lg': '0 2px 4px rgba(26, 24, 14, 0.06), 0 14px 36px rgba(26, 24, 14, 0.10)',
        'inset-warm': 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      transitionTimingFunction: {
        'paper': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
