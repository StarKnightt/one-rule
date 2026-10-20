import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  preview: { port: 4173, strictPort: true },
});
