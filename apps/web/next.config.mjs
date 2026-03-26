import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      // Externalize Puppeteer, Playwright and their dependencies to avoid bundling issues
      config.externals = config.externals || [];
      config.externals.push({
        'puppeteer': 'commonjs puppeteer',
        'puppeteer-core': 'commonjs puppeteer-core',
        'playwright': 'commonjs playwright',
        'playwright-core': 'commonjs playwright-core',
        'electron': 'commonjs electron',
        'bufferutil': 'commonjs bufferutil',
        'utf-8-validate': 'commonjs utf-8-validate',
      });
      
      // Ignore dynamic requires for worker orchestrator (prevent webpack from trying to bundle it)
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /orchestrator/,
          contextRegExp: /worker/,
        })
      );
    }
    // Ensure Prisma client can be resolved in monorepo
    config.resolve = config.resolve || {};
    config.resolve.symlinks = true;
    return config;
  },
};

export default nextConfig;

