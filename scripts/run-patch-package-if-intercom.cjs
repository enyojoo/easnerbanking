'use strict'

/**
 * patch-package fails if a patch exists but the package is not installed.
 * Vercel installs only a subset of workspaces (no mobile), so @intercom/intercom-react-native
 * is absent — skip applying patches in that case.
 *
 * CommonJS (.cjs) avoids ESM / import.meta warnings during npm postinstall on some Node versions.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

const candidates = [
  path.join(root, 'node_modules', '@intercom', 'intercom-react-native', 'package.json'),
  path.join(root, 'mobile', 'node_modules', '@intercom', 'intercom-react-native', 'package.json'),
]

const hasIntercom = candidates.some((p) => fs.existsSync(p))

if (!hasIntercom) {
  // Avoid stderr so npm/Vercel does not surface this as a warning line.
  if (process.env.DEBUG_POSTINSTALL === '1') {
    console.log(
      '[patch-package] Skipping: @intercom/intercom-react-native not installed (partial workspace install).',
    )
  }
  process.exit(0)
}

const patchPackageCli = path.join(root, 'node_modules', 'patch-package', 'index.js')

if (!fs.existsSync(patchPackageCli)) {
  process.exit(0)
}

const r = spawnSync(process.execPath, [patchPackageCli], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
