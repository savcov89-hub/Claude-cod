// Builds the test version as one self-contained HTML file (Claude artifact).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: { 'import.meta.env.VITE_LOCAL_ONLY': JSON.stringify('1') },
  resolve: {
    alias: { '@supabase/supabase-js': path.resolve(__dirname, 'src/local/supabase-stub.ts') },
  },
  build: { outDir: 'dist-artifact', emptyOutDir: true },
});
