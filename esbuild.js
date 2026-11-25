const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const staticAssets = [
  // loaded by the extension from dist at runtime
  'src/webview.html',
  'src/template.default.hbs',
  'src/template-markdown.default.hbs',
];

/**
 * Copy the static assets (webview HTML, default Handlebars templates, icons)
 * into the output directory, from where the extension loads them at runtime.
 * @type {import('esbuild').Plugin}
 */
const copyAssetsPlugin = {
  name: 'copy-assets',

  setup(build) {
    build.onEnd(() => {
      fs.mkdirSync('dist', { recursive: true });
      staticAssets.forEach((file) => {
        fs.copyFileSync(file, path.join('dist', path.basename(file)));
      });
      fs.readdirSync('images/icons')
        .filter((file) => file.endsWith('.svg'))
        .forEach((file) => {
          fs.copyFileSync(path.join('images/icons', file), path.join('dist', file));
        });
    });
  },
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
      copyAssetsPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
