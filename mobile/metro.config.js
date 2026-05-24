const fs = require('fs')
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// EAS / CI: `getMetroServerRoot` can resolve to `mobile/` when the parent workspace is not detected
// the same way as on a local disk. Metro then treats `../node_modules` as outside `unstable_serverRoot`
// and fails to resolve hoisted deps (e.g. `@supabase/supabase-js`). Align server root with npm workspaces.
try {
  const rootPkgPath = path.join(monorepoRoot, 'package.json')
  if (fs.existsSync(rootPkgPath)) {
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'))
    const ws = rootPkg.workspaces
    if (Array.isArray(ws) || (ws && typeof ws === 'object')) {
      config.server = {
        ...(config.server || {}),
        unstable_serverRoot: monorepoRoot,
      }
    }
  }
} catch {
  // keep Expo default
}

// Keep Expo's default workspace watchFolders (expo-doctor) and ensure the monorepo root is included.
const defaultWatchFolders = Array.isArray(config.watchFolders) ? config.watchFolders : [projectRoot]
config.watchFolders = [...new Set([...defaultWatchFolders, monorepoRoot])]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

const sharedRoot = path.resolve(monorepoRoot, 'packages/shared')
const extraNodeModules = {
  '@easner/shared': sharedRoot,
  // Metro extraNodeModules points at the package dir, not package.json exports subpaths.
  '@easner/shared/warm-flags': path.join(sharedRoot, 'src/flags/warm-flags.native.ts'),
  '@easner/shared/hooks/use-payout-min-enforcement': path.join(
    sharedRoot,
    'src/hooks/use-payout-min-enforcement.ts',
  ),
}

// EAS monorepo: hoisted deps may only exist under ../node_modules; force resolution if present.
for (const pkg of ['@supabase/supabase-js']) {
  try {
    const dir = path.dirname(
      require.resolve(`${pkg}/package.json`, { paths: [projectRoot, monorepoRoot] })
    )
    extraNodeModules[pkg] = dir
  } catch {
    // Missing at config load — install issue; Metro will surface the same as before.
  }
}

// @noble/hashes: `package.json` "exports" omit `package.json` itself, so use a known subpath.
try {
  const nobleEntry = require.resolve('@noble/hashes/pbkdf2.js', {
    paths: [projectRoot, monorepoRoot],
  })
  extraNodeModules['@noble/hashes'] = path.dirname(nobleEntry)
} catch {
  // install issue
}

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...extraNodeModules,
}

module.exports = config
