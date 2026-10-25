import { defineConfig } from 'vite';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Offline-Modus: trägt nach dem Build ALLE erzeugten Dateien (HTML, CSS, JS,
 * Icons, Lazy-Chunks wie Scanner/QR) in public/sw.js ein, damit der Service
 * Worker sie bei der Installation komplett vorab speichert.
 * (Erfüllt dieselbe Aufgabe wie vite-plugin-pwa – ohne zusätzliche Abhängigkeit.)
 */
function precacheServiceWorker() {
  let outDir = 'dist';
  return {
    name: 'sparesync-precache',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const swPath = join(outDir, 'sw.js');
      if (!existsSync(swPath)) return;
      const files = [];
      const walk = (d) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p); else files.push(relative(outDir, p).split(sep).join('/'));
        }
      };
      walk(outDir);
      const list = files
        .filter((f) => f !== 'sw.js' && !/\.(map|mp4|mov|webm)$/i.test(f))
        .map((f) => `./${f}`);
      const sw = readFileSync(swPath, 'utf8')
        .replace('self.__PRECACHE = [];', `self.__PRECACHE = ${JSON.stringify(list)};`)
        .replace("'__BUILD__'", JSON.stringify(Date.now().toString(36)));
      writeFileSync(swPath, sw);
      console.log(`\n[offline] ${list.length} Dateien für den Offline-Modus eingetragen`);
    },
  };
}

// base './' = funktioniert auf GitHub Pages in jedem Repo-Unterordner
export default defineConfig({
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
  plugins: [precacheServiceWorker()],
});
