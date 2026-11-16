import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@deployments': fileURLToPath(
        new URL('./src/config/network/anvil31337_dev/network.json', import.meta.url),
      ),
    },
  },
  define: {
    'import.meta.env.VITE_ENV': JSON.stringify('dev'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
    reporters: ['default'],
    // Vitest 默认 5 s：全量套件在 pre-commit 钩子或别的重活并行时会闪红
    // （tests/sync-network.test.ts 要起子进程 + 跑 prettier，实测单跑 1.3 s、满载超 5 s）。
    // 15 s 仍能拦住真正卡死的用例，同时不让门禁随机变红。
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
