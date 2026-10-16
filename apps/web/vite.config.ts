import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // ローカル開発では /api/* を API サーバー（apps/api、既定は 8787 番）へ転送し、本番と同じく同じオリジンにする（D15）
    // キーは '/api/'（'/api' だと '/apiary' のような画面のパスまで転送される）
    proxy: { '/api/': process.env.API_URL ?? 'http://localhost:8787' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
