import * as esbuild from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))

const esbuildBase = {
  bundle: true,
  minify: true,
  target: 'chrome120',
  logLevel: 'info',
}

// background service worker
await esbuild.build({
  ...esbuildBase,
  entryPoints: [join(root, 'src/background/backgroundService.ts')],
  outfile: join(root, 'dist/background.js'),
  format: 'iife',
  platform: 'browser',
})

// content script
await esbuild.build({
  ...esbuildBase,
  entryPoints: [join(root, 'src/content/rakutenContentScript.ts')],
  outfile: join(root, 'dist/content.js'),
  format: 'iife',
  platform: 'browser',
  define: { 'import.meta': '{}' },
})

// manifest.json 生成
const distManifest = {
  ...manifest,
  version: pkg.version,
  background: {
    service_worker: 'background.js',
  },
  action: {
    ...manifest.action,
    default_popup: 'src/popup/index.html',
  },
  content_scripts: (manifest.content_scripts ?? []).map((cs, i) =>
    i === 0 ? { ...cs, js: ['content.js'] } : cs
  ),
}
delete distManifest.$schema

writeFileSync(
  join(root, 'dist/manifest.json'),
  JSON.stringify(distManifest, null, 2),
  'utf8'
)
console.log('dist/manifest.json written')

// icons コピー
const iconsDir = join(root, 'icons')
const distIconsDir = join(root, 'dist/icons')
mkdirSync(distIconsDir, { recursive: true })
for (const file of readdirSync(iconsDir)) {
  copyFileSync(join(iconsDir, file), join(distIconsDir, file))
}
console.log('icons copied to dist/icons')
