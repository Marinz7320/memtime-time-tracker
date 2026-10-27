/// <reference types="vitest" />
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The API key never ships to the browser.
 *
 * The browser calls same-origin `/api/*`; the Vite dev/preview server forwards
 * the request to the real API and injects the `Authorization` header from the
 * server-side `.env` (variables without the `VITE_` prefix are not bundled).
 * This also sidesteps CORS. In production the same role would be played by a
 * small backend-for-frontend (e.g. an ASP.NET Core minimal API / YARP proxy).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_BASE_URL || 'https://interview-api.memtime-demo.deno.net';
  const apiKey = env.API_KEY;

  if (!apiKey && mode !== 'test') {
    console.warn('\n⚠  API_KEY is not set. Copy .env.example to .env and add your key.\n');
  }

  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target,
      changeOrigin: true,
      secure: true,
      configure: (p) => {
        p.on('proxyReq', (proxyReq) => {
          if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
        });
      },
    },
  };

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: {
      environment: 'jsdom',
      globals: false,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
