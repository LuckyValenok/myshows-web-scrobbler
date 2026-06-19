import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

const manifestPath = join(root, 'src/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.version = version
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Synced version ${version} → src/manifest.json`)
