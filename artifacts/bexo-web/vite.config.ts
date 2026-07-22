import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const port = Number(process.env.PORT || '5173');
const basePath = process.env.BASE_PATH || '/';

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(import.meta.dirname);
  const rootDir = path.resolve(import.meta.dirname, '../..');
  const rootEnv = loadEnv(mode, rootDir, '');
  const fileEnv = loadEnv(mode, envDir, '');
  const combinedEnv = { ...rootEnv, ...fileEnv };

  for (const [key, val] of Object.entries(combinedEnv)) {
    if (key.startsWith('VITE_') && (!process.env[key] || mode === 'production')) {
      process.env[key] = val;
    }
  }

  // Shell/direnv often exports VITE_API_URL=http://localhost:5001 for local
  // development. That value must NOT win over .env.production — otherwise the
  // production bundle calls localhost and mobile OTP fails with "Load failed".
  if (mode === 'production') {
    const productionApi = fileEnv.VITE_API_URL || 'https://atbexo.com';
    if (!process.env.VITE_API_URL || /localhost|127\.0\.0\.1/i.test(process.env.VITE_API_URL)) {
      process.env.VITE_API_URL = productionApi;
    }
  }

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@assets': path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'attached_assets',
        ),
      },
      dedupe: ['react', 'react-dom'],
    },
    root: path.resolve(import.meta.dirname),
    envDir,
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
        },
        '/sitemap.xml': { target: 'http://localhost:5001', changeOrigin: true },
        '/sitemap-static.xml': { target: 'http://localhost:5001', changeOrigin: true },
        '/sitemap-portfolios.xml': { target: 'http://localhost:5001', changeOrigin: true },
        '/robots.txt': { target: 'http://localhost:5001', changeOrigin: true },
      },
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
