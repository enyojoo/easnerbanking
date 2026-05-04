#!/usr/bin/env node
/**
 * patch-package fails if a patch exists but the package is not installed.
 * Vercel installs only a subset of workspaces (no mobile), so @intercom/intercom-react-native
 * is absent — skip applying patches in that case.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const candidates = [
  path.join(root, 'node_modules', '@intercom', 'intercom-react-native', 'package.json'),
  path.join(root, 'mobile', 'node_modules', '@intercom', 'intercom-react-native', 'package.json'),
]

const hasIntercom = candidates.some((p) => fs.existsSync(p))

if (!hasIntercom) {
  console.log(
    '[patch-package] Skipping: @intercom/intercom-react-native not installed (partial workspace install).',
  )
  process.exit(0)
}

const r = spawnSync('npx', ['patch-package'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(r.status ?? 1)
