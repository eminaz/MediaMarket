import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['sharp'],
  devIndicators: false,
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ['127.0.0.1'],
};
export default config;
