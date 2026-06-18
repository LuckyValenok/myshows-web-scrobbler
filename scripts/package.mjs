import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const zipName = `myshows-web-scrobbler-${pkg.version}.zip`

execSync(`cd "${join(root, 'dist')}" && zip -r "../${zipName}" .`, {
  stdio: 'inherit',
})

console.log(`Created ${zipName}`)
