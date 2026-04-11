#!/usr/bin/env node
/**
 * npm workspaces hoist deps to the repo root. Expo config plugins resolve modules
 * relative to the app directory only, so EAS Build can fail with "Failed to resolve
 * plugin for module expo-secure-store" when packages exist only in ../node_modules.
 *
 * Symlink each direct dependency from the root node_modules into mobile/node_modules
 * when missing. Uses absolute symlink targets (more reliable than relative on CI).
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

  if (fs.existsSync(dest)) {
    try {
      const st = fs.lstatSync(dest)
      if (st.isSymbolicLink()) {
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

for (const name of names) {
  if (name.startsWith('@')) {
    const scope = name.split('/')[0]
    linkDep(scope)
  }
  linkDep(name)
}
