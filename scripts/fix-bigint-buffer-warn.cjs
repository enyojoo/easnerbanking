'use strict'

/**
 * bigint-buffer (via @solana/spl-token → @solana/buffer-layout-utils) logs a
 * console.warn when optional native bindings fail to load. Behavior is correct
 * without them; the warning only adds noise in CI and Next builds.
 *
 * 1) Try `npm rebuild bigint-buffer` locally so bindings compile when toolchain exists.
 *    Skipped on Vercel — native rebuild adds noisy node-gyp stderr / failures there.
 * 2) Strip the warn line from every installed dist/node.js copy so fallback stays silent.
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

/** Line emitted by bigint-buffer@1.1.5 (quoting may change in future versions). */
const WARN_LINE_RE =
  /\r?\n[ \t]*console\.warn\(\s*['"]bigint: Failed to load bindings, pure JS will be used \(try npm run rebuild\?\)['"]\s*\);[ \t]*/g

function rebuild () {
  if (process.env.VERCEL === '1') return
  if (!fs.existsSync(path.join(root, 'node_modules', 'bigint-buffer', 'package.json'))) return
  try {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['rebuild', 'bigint-buffer'], {
      cwd: root,
      stdio: 'ignore',
    })
  } catch {
    // No native toolchain is fine; we patch the warn below.
  }
}

/**
 * @returns {string[]}
 */
function findBigintBufferNodeJs () {
  const out = []
  const seen = new Set()
  const stack = [path.join(root, 'node_modules')]
  while (stack.length) {
    const nm = stack.pop()
    let real
    try {
      real = fs.realpathSync(nm)
    } catch {
      continue
    }
    if (seen.has(real)) continue
    seen.add(real)
    let entries
    try {
      entries = fs.readdirSync(nm, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      const full = path.join(nm, ent.name)
      if (ent.name === 'bigint-buffer') {
        const f = path.join(full, 'dist', 'node.js')
        try {
          if (fs.existsSync(f)) out.push(f)
        } catch {
          continue
        }
      }
      const nested = path.join(full, 'node_modules')
      if (fs.existsSync(nested)) stack.push(nested)
    }
  }
  return out
}

function stripWarn () {
  for (const nodeJs of findBigintBufferNodeJs()) {
    try {
      const before = fs.readFileSync(nodeJs, 'utf8')
      WARN_LINE_RE.lastIndex = 0
      const after = before.replace(WARN_LINE_RE, '\n')
      if (after !== before) fs.writeFileSync(nodeJs, after)
    } catch {
      // Ignore unreadable trees (e.g. frozen installs).
    }
  }
}

try {
  rebuild()
  stripWarn()
} catch {
  // Never fail install — bigint-buffer still works via pure JS fallback.
}
process.exitCode = 0
