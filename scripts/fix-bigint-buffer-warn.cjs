'use strict'

/**
 * bigint-buffer (via @solana/spl-token → @solana/buffer-layout-utils) logs a
 * console.warn when optional native bindings fail to load. Behavior is correct
 * without them; the warning only adds noise in CI and Next builds.
 *
 * 1) Try `npm rebuild bigint-buffer` so bindings compile when node-gyp/toolchain exists.
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
  if (!fs.existsSync(path.join(root, 'node_modules', 'bigint-buffer', 'package.json'))) return
  try {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['rebuild', 'bigint-buffer'], {
      cwd: root,
      stdio: 'pipe',
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
  const stack = [path.join(root, 'node_modules')]
  while (stack.length) {
    const nm = stack.pop()
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
        if (fs.existsSync(f)) out.push(f)
      }
      const nested = path.join(full, 'node_modules')
      if (fs.existsSync(nested)) stack.push(nested)
    }
  }
  return out
}

function stripWarn () {
  for (const nodeJs of findBigintBufferNodeJs()) {
    const before = fs.readFileSync(nodeJs, 'utf8')
    WARN_LINE_RE.lastIndex = 0
    const after = before.replace(WARN_LINE_RE, '\n')
    if (after !== before) fs.writeFileSync(nodeJs, after)
  }
}

rebuild()
stripWarn()
