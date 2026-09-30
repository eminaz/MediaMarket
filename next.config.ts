import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.NEXT_TEST_BUILD === '1' ? '.next/testing' : '.next',
  serverExternalPackages: ['sharp', '@solana/pay-kit'],
  devIndicators: false,
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ['127.0.0.1'],
};
export default config;
