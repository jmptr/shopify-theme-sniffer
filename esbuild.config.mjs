import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

/** Compile Tailwind CSS via PostCSS. */
function buildCss() {
  const input = resolve(__dirname, 'src/styles/global.css');
  const output = resolve(__dirname, 'dist/styles/global.css');
  mkdirSync(resolve(__dirname, 'dist/styles'), { recursive: true });
  execSync(`npx postcss "${input}" -o "${output}"`, { stdio: 'inherit' });
  console.log('[postcss] CSS compiled to dist/styles/global.css');
}

/** Copy static assets (manifest, HTML, icons) into dist/. */
function copyStaticFiles() {
  const src = resolve(__dirname, 'src');
  const dist = resolve(__dirname, 'dist');

  mkdirSync(dist, { recursive: true });

  // manifest.json
  cpSync(resolve(src, 'manifest.json'), resolve(dist, 'manifest.json'));

  // popup
  mkdirSync(resolve(dist, 'popup'), { recursive: true });
  cpSync(resolve(src, 'popup/popup.html'), resolve(dist, 'popup/popup.html'));

  // dashboard
  mkdirSync(resolve(dist, 'dashboard'), { recursive: true });
  cpSync(resolve(src, 'dashboard/dashboard.html'), resolve(dist, 'dashboard/dashboard.html'));

  // logs
  mkdirSync(resolve(dist, 'logs'), { recursive: true });
  cpSync(resolve(src, 'logs/logs.html'), resolve(dist, 'logs/logs.html'));

  // products
  mkdirSync(resolve(dist, 'products'), { recursive: true });
  cpSync(resolve(src, 'products/products.html'), resolve(dist, 'products/products.html'));

  // icons (copy entire directory)
  cpSync(resolve(src, 'icons'), resolve(dist, 'icons'), { recursive: true });
}

/** esbuild plugin that copies static files after each build. */
const copyPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(() => {
      copyStaticFiles();
      buildCss();
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
  jsx: 'automatic',
};

// IIFE bundles (background + content scripts)
const iifeConfig = {
  ...commonOptions,
  entryPoints: [
    resolve(__dirname, 'src/background.ts'),
    resolve(__dirname, 'src/content.ts'),
    resolve(__dirname, 'src/detect.ts'),
  ],
  outdir: resolve(__dirname, 'dist'),
  format: 'iife',
  plugins: [copyPlugin],
};

// IIFE bundles (popup, dashboard, logs, products)
const pageConfig = {
  ...commonOptions,
  entryPoints: [
    resolve(__dirname, 'src/popup/popup.tsx'),
    resolve(__dirname, 'src/dashboard/dashboard.tsx'),
    resolve(__dirname, 'src/logs/logs.tsx'),
    resolve(__dirname, 'src/products/products.tsx'),
  ],
  outdir: resolve(__dirname, 'dist'),
  outbase: resolve(__dirname, 'src'),
  format: 'iife',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

async function main() {
  if (isWatch) {
    const iifeCtx = await esbuild.context(iifeConfig);
    const esmCtx = await esbuild.context(pageConfig);
    await Promise.all([iifeCtx.watch(), esmCtx.watch()]);
    console.log('[esbuild] Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(iifeConfig),
      esbuild.build(pageConfig),
    ]);
    console.log('[esbuild] Build complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
