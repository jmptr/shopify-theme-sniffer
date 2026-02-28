import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

/** Copy static assets (manifest, HTML, CSS, icons) into dist/. */
function copyStaticFiles() {
  const src = resolve(__dirname, 'src');
  const dist = resolve(__dirname, 'dist');

  mkdirSync(dist, { recursive: true });

  // manifest.json
  cpSync(resolve(src, 'manifest.json'), resolve(dist, 'manifest.json'));

  // popup
  mkdirSync(resolve(dist, 'popup'), { recursive: true });
  cpSync(resolve(src, 'popup/popup.html'), resolve(dist, 'popup/popup.html'));
  cpSync(resolve(src, 'popup/popup.css'), resolve(dist, 'popup/popup.css'));

  // dashboard
  mkdirSync(resolve(dist, 'dashboard'), { recursive: true });
  cpSync(resolve(src, 'dashboard/dashboard.html'), resolve(dist, 'dashboard/dashboard.html'));
  cpSync(resolve(src, 'dashboard/dashboard.css'), resolve(dist, 'dashboard/dashboard.css'));

  // logs
  mkdirSync(resolve(dist, 'logs'), { recursive: true });
  cpSync(resolve(src, 'logs/logs.html'), resolve(dist, 'logs/logs.html'));
  cpSync(resolve(src, 'logs/logs.css'), resolve(dist, 'logs/logs.css'));

  // icons (copy entire directory)
  cpSync(resolve(src, 'icons'), resolve(dist, 'icons'), { recursive: true });
}

/** esbuild plugin that copies static files after each build. */
const copyPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(() => {
      copyStaticFiles();
      console.log('[copy-static] Static files copied to dist/');
    });
  },
};

// Shared options
const commonOptions = {
  bundle: true,
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
};

// IIFE bundles (background + content scripts)
const iifeConfig = {
  ...commonOptions,
  entryPoints: [
    resolve(__dirname, 'src/background.ts'),
    resolve(__dirname, 'src/content.ts'),
  ],
  outdir: resolve(__dirname, 'dist'),
  format: 'iife',
  plugins: [copyPlugin],
};

// ESM bundles (popup, dashboard, logs)
const esmConfig = {
  ...commonOptions,
  entryPoints: [
    resolve(__dirname, 'src/popup/popup.ts'),
    resolve(__dirname, 'src/dashboard/dashboard.ts'),
    resolve(__dirname, 'src/logs/logs.ts'),
  ],
  outdir: resolve(__dirname, 'dist'),
  outbase: resolve(__dirname, 'src'),
  format: 'esm',
};

async function main() {
  if (isWatch) {
    const iifeCtx = await esbuild.context(iifeConfig);
    const esmCtx = await esbuild.context(esmConfig);
    await Promise.all([iifeCtx.watch(), esmCtx.watch()]);
    console.log('[esbuild] Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(iifeConfig),
      esbuild.build(esmConfig),
    ]);
    console.log('[esbuild] Build complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
