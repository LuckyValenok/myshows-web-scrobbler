import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'

const rootDir = dirname(fileURLToPath(import.meta.url))
const version = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')).version

export default defineConfig({
  plugins: [crx({ manifest: { ...manifest, version } })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        matches: resolve(rootDir, 'src/matches/matches.html'),
      },
    },
  },
})
