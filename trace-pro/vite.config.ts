import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Serve `data/` and `vendor/` from the repo root in dev, and copy them into `dist/` on build.
 *
 * They deliberately do NOT live in `public/`: keeping one copy of the 614 KiB of fixtures and the
 * two vendored libraries means the documented file tree matches reality and nothing is duplicated
 * in git.
 */
function serveRootDirs(dirs: string[]): Plugin {
  return {
    name: 'trace-pro-serve-root-dirs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        const top = url.split('/')[1] ?? '';
        if (!dirs.includes(top)) return next();
        const file = path.join(process.cwd(), url);
        if (!file.startsWith(process.cwd()) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          return next();
        }
        const type = file.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : 'text/javascript; charset=utf-8';
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const d of dirs) {
        const from = path.join(process.cwd(), d);
        if (fs.existsSync(from)) fs.cpSync(from, path.join(process.cwd(), 'dist', d), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serveRootDirs(['data', 'vendor'])],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: { port: 5178 },
});
