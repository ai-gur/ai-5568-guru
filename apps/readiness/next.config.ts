import type { NextConfig } from 'next';

const config: NextConfig = {
  // The workspace packages ship TypeScript source rather than build output, so
  // Next has to compile them rather than treat them as opaque dependencies.
  transpilePackages: ['@ai5568/criteria', '@ai5568/report-contract', '@ai5568/scan-policy'],
  poweredByHeader: false,
};

export default config;
