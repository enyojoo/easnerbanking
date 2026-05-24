#!/usr/bin/env node
/**
 * npm workspaces hoist deps to the repo root. Expo config plugins resolve modules
 * from the plugin package location (often hoisted to ../node_modules), so local
 * `expo start` fails with "Cannot find module 'expo/config-plugins'" when `expo`
 * lives only under mobile/node_modules. EAS Build can also fail when plugins exist
 * only in ../node_modules and mobile/node_modules is missing them.
 *
 * - Symlink each direct dependency from root node_modules into mobile/node_modules
 *   when missing.
 * - Symlink `expo` from mobile/node_modules into root/node_modules when missing
 *   (hoisted expo-* plugins require expo/config-plugins from the root tree).
 *
 * Uses absolute symlink targets (more reliable than relative on CI).
 */
const fs = require('fs')
const path = require('path')

const mobileDir = path.resolve(__dirname, '..')
const rootDir = path.resolve(mobileDir, '..')
const rootNm = path.join(rootDir, 'node_modules')
const mobileNm = path.join(mobileDir, 'node_modules')

function linkDep(name) {
  const src = path.join(rootNm, name)
  const dest = path.join(mobileNm, name)
  if (!fs.existsSync(src)) return

  // If the parent of `dest` already resolves to the parent of `src` (because a
  // scoped parent like mobile/node_modules/@easner is itself a symlink to
  // root/node_modules/@easner), unlink+symlink would destroy the root entry
  // and recreate it as a self-referencing loop. Skip in that case.
  try {
    const srcParent = fs.realpathSync(path.dirname(src))
    const destParentReal = fs.realpathSync(path.dirname(dest))
    if (srcParent === destParentReal) return
  } catch {}

  if (fs.existsSync(dest)) {
    try {
      const st = fs.lstatSync(dest)
      if (st.isSymbolicLink()) {
        try {
          if (fs.realpathSync(dest) === fs.realpathSync(src)) return
        } catch {}
        fs.unlinkSync(dest)
      } else {
        return
      }
    } catch {
      return
    }
  }

  const destParent = path.dirname(dest)
  try {
    if (!fs.existsSync(destParent)) {
      fs.mkdirSync(destParent, { recursive: true })
    }
  } catch (e) {
    console.warn('[linkWorkspaceDeps] mkdir', destParent, e.message)
    return
  }

  try {
    fs.symlinkSync(src, dest)
  } catch (e) {
    const err = e
    if (err && err.code !== 'EEXIST') {
      console.warn('[linkWorkspaceDeps]', name, err.message)
    }
  }
}

if (!fs.existsSync(rootNm)) {
  console.warn('[linkWorkspaceDeps] skip: no root node_modules at', rootNm)
  process.exit(0)
}

try {
  if (!fs.existsSync(mobileNm)) fs.mkdirSync(mobileNm, { recursive: true })
} catch (e) {
  console.warn('[linkWorkspaceDeps] mkdir mobile/node_modules:', e.message)
  process.exit(0)
}

let pkg
try {
  pkg = JSON.parse(fs.readFileSync(path.join(mobileDir, 'package.json'), 'utf8'))
} catch {
  process.exit(0)
}

const names = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
])

/** Keep mobile on SDK-pinned React; do not symlink the root workspace copies. */
const SKIP_LINK = new Set(['react', 'react-dom', 'react-native'])

for (const name of names) {
  if (SKIP_LINK.has(name)) continue
  if (name.startsWith('@')) {
    const scope = name.split('/')[0]
    linkDep(scope)
  }
  linkDep(name)
}

/** npm workspaces may link @expo/cli as expo-internal but not `expo`. */
function linkExpoBin(dir) {
  const binDir = path.join(dir, 'node_modules', '.bin')
  const expoCli = path.join(dir, 'node_modules', 'expo', 'bin', 'cli')
  if (!fs.existsSync(expoCli)) return

  try {
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true })
  } catch {
    return
  }

  const dest = path.join(binDir, 'expo')
  if (fs.existsSync(dest)) return

  try {
    fs.symlinkSync(path.relative(binDir, expoCli), dest)
  } catch (e) {
    console.warn('[linkWorkspaceDeps] expo bin:', e.message)
  }
}

linkExpoBin(rootDir)
linkExpoBin(mobileDir)

/**
 * Hoisted expo-* config plugins (e.g. expo-system-ui) resolve `expo/config-plugins`
 * from the root node_modules tree, but npm workspaces often keep `expo` only under
 * mobile/node_modules.
 */
function linkExpoToRoot() {
  const src = path.join(mobileNm, 'expo')
  const dest = path.join(rootNm, 'expo')
  if (!fs.existsSync(src)) return

  if (fs.existsSync(dest)) {
    try {
      const st = fs.lstatSync(dest)
      if (st.isSymbolicLink()) {
        try {
          if (fs.realpathSync(dest) === fs.realpathSync(src)) return
        } catch {}
        fs.unlinkSync(dest)
      } else {
        return
      }
    } catch {
      return
    }
  }

  try {
    fs.symlinkSync(src, dest)
  } catch (e) {
    const err = e
    if (err && err.code !== 'EEXIST') {
      console.warn('[linkWorkspaceDeps] expo → root:', err.message)
    }
  }
}

linkExpoToRoot()

