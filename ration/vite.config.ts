// «Рацион» — отдельная страница сайта (dist/ration/), открывается во вкладке клиента в iframe: свои стили (Tailwind)
// не смешиваются со стилями Training Log. Решатель HiGHS (WebAssembly) работает в браузере.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    outDir: path.resolve(__dirname, '..', process.env.APPDEPLOY_VITE_OUT_DIR || 'dist', 'ration'),
    emptyOutDir: true,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
