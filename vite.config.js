import { defineConfig } from 'vite';

// base './' = funktioniert auf GitHub Pages in jedem Repo-Unterordner
export default defineConfig({
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
