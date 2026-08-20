#!/usr/bin/env node
/**
 * EAS / npm workspaces: deps often live only under the repo root. Metro may still fail to
 * resolve them during `expo export:embed`. Copy a hoisted scope (e.g. `@supabase`) from
 * ../node_modules into mobile/node_modules so resolution stays inside the app folder.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const mobileDir = path.resolve(__dirname, '..')
const rootDir = path.resolve(mobileDir, '..')

const scope = process.argv[2]
if (!scope || !scope.startsWith('@')) {
  console.error('Usage: syncHoistedScope.js @scopeName')
  process.exit(1)
}

const src = path.join(rootDir, 'node_modules', scope)
const dest = path.join(mobileDir, 'node_modules', scope)

function ensureRootInstall() {
  const lock = path.join(rootDir, 'package-lock.json')
  const pkg = path.join(rootDir, 'package.json')
  if (!fs.existsSync(pkg)) {
    console.error('[syncHoistedScope] no root package.json at', rootDir)
    process.exit(1)
  }
  if (fs.existsSync(src)) return
  console.warn('[syncHoistedScope] missing', src, '– running npm install at repo root')
  try {
    if (fs.existsSync(lock)) {
      execSync('npm ci --ignore-scripts', { cwd: rootDir, stdio: 'inherit' })
    } else {
      execSync('npm install --ignore-scripts', { cwd: rootDir, stdio: 'inherit' })
    }
  } catch {
    execSync('npm install --ignore-scripts', { cwd: rootDir, stdio: 'inherit' })
  }
}

ensureRootInstall()

if (!fs.existsSync(src)) {
  console.error('[syncHoistedScope] still missing after install:', src)
  process.exit(1)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.rmSync(dest, { recursive: true, force: true })
fs.mkdirSync(dest, { recursive: true })

const mobilePrefix = mobileDir + path.sep
for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
  const from = path.join(src, ent.name)
  if (!ent.isDirectory() && !ent.isSymbolicLink()) continue

  let real = from
  if (ent.isSymbolicLink()) {
    try {
      real = fs.realpathSync(from)
    } catch {
      console.warn('[syncHoistedScope] skip broken symlink', from)
      continue
    }
  }
  if (real === mobileDir || real.startsWith(mobilePrefix)) {
    console.warn('[syncHoistedScope] skip (points into mobile, would loop):', from)
    continue
  }

  const to = path.join(dest, ent.name)
  fs.cpSync(real, to, { recursive: true })
}

if (scope === '@supabase') {
  const marker = path.join(dest, 'supabase-js', 'package.json')
  if (!fs.existsSync(marker)) {
    console.warn('[syncHoistedScope] supabase-js missing after copy; refreshing root install')
    execSync('npm install --ignore-scripts', { cwd: rootDir, stdio: 'inherit' })
    const fromJs = path.join(rootDir, 'node_modules', '@supabase', 'supabase-js')
    if (fs.existsSync(fromJs)) {
      let realJs = fromJs
      try {
        realJs = fs.realpathSync(fromJs)
      } catch {
        /* keep fromJs */
      }
      if (!realJs.startsWith(mobilePrefix)) {
        fs.rmSync(path.join(dest, 'supabase-js'), { recursive: true, force: true })
        fs.cpSync(realJs, path.join(dest, 'supabase-js'), { recursive: true })
      }
    }
  }
  if (!fs.existsSync(path.join(dest, 'supabase-js', 'package.json'))) {
    console.error('[syncHoistedScope] FATAL: @supabase/supabase-js not on disk after sync')
    process.exit(1)
  }
}

console.log('[syncHoistedScope]', scope, '→', dest)
