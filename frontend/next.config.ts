import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @noble/curves ships ESM; Next handles it natively but the transpile list
  // protects against consumer-side CJS interop issues when wagmi/rainbowkit
  // are resolved through their own bundler hints.
  transpilePackages: ['@noble/curves', '@noble/hashes'],
};

export default nextConfig;
