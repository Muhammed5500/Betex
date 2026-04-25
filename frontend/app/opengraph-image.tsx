import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Betex — Encrypted DEX on Monad';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background: '#0a0a0a',
          color: '#ededed',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>
          Betex
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div
            style={{
              fontSize: 16,
              color: '#888888',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
            }}
          >
            Monad testnet · 3rd place, Monad Kayseri 2026
          </div>

          <div
            style={{
              fontSize: 112,
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: '-0.035em',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div>Encrypted swaps.</div>
            <div>Zero MEV.</div>
          </div>

          <div
            style={{
              fontSize: 26,
              color: '#b3b3b3',
              maxWidth: 900,
              lineHeight: 1.4,
            }}
          >
            Every order encrypted in your browser. Revealed only by a 2-of-3
            committee. Built on BTX threshold encryption.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 20,
            color: '#555555',
            borderTop: '1px solid #1f1f1f',
            paddingTop: 24,
          }}
        >
          <div style={{ fontFamily: 'monospace' }}>betex.xyz</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: '#836ef9',
              }}
            />
            <span>BTX · EIP-2537</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
