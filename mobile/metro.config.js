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
const sharedCurrencyFlagNative = path.join(sharedRoot, 'src/components/CountryFlag.native.tsx')
const sharedCountryRegistrationNative = path.join(
  sharedRoot,
  'src/lib-address/country-registration.native.ts',
)

const extraNodeModules = {
  '@easner/shared': sharedRoot,
  // Metro extraNodeModules points at the package dir, not package.json exports subpaths.
  '@easner/shared/warm-flags': path.join(sharedRoot, 'src/flags/warm-flags.native.ts'),
  '@easner/shared/currency-flag': path.join(sharedRoot, 'src/components/CountryFlag.native.tsx'),
  '@easner/shared/postal-address-form': path.join(sharedRoot, 'src/postal-address-form.ts'),
}

try {
  extraNodeModules['lib-address'] = path.dirname(
    require.resolve('lib-address/package.json', { paths: [projectRoot, monorepoRoot] }),
  )
} catch {
  // install issue
}

// EAS monorepo: hoisted deps may only exist under ../node_modules; force resolution if present.
for (const pkg of ['@supabase/supabase-js']) {
  try {
    const dir = path.dirname(
      require.resolve(`${pkg}/package.json`, { paths: [projectRoot, monorepoRoot] })
    )
    extraNodeModules[pkg] = dir
  } catch {
    // Missing at config load – install issue; Metro will surface the same as before.
  }
}

// @noble/hashes: ESM utils import `@noble/hashes/crypto` but Metro may resolve `crypto.js`,
// which is not listed in package.json "exports" (only `./crypto` is). Map common subpaths explicitly.
try {
  const nobleDir = path.dirname(
    require.resolve('@noble/hashes/pbkdf2.js', { paths: [projectRoot, monorepoRoot] })
  )
  extraNodeModules['@noble/hashes'] = nobleDir
  for (const sub of ['crypto', 'pbkdf2', 'sha2', 'utils', 'hmac']) {
    const file = path.join(nobleDir, `${sub}.js`)
    extraNodeModules[`@noble/hashes/${sub}`] = file
    extraNodeModules[`@noble/hashes/${sub}.js`] = file
  }
} catch {
  // install issue
}

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...extraNodeModules,
}

// Web export: some deps import `@noble/hashes/crypto.js` (not in package exports). Resolve explicitly.
const nobleHashesCrypto = (() => {
  try {
    const nobleDir = path.dirname(
      require.resolve('@noble/hashes/package.json', { paths: [projectRoot, monorepoRoot] }),
    )
    return path.join(nobleDir, 'crypto.js')
  } catch {
    return null
  }
})()

const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    nobleHashesCrypto &&
    (moduleName === '@noble/hashes/crypto.js' || moduleName === '@noble/hashes/crypto')
  ) {
    return { type: 'sourceFile', filePath: nobleHashesCrypto }
  }
  // Native Stripe SDK talks to the RN bridge; never evaluate it in the web bundle.
  // @stripe/crypto must load from a same-origin script tag, not Metro chunks.
  if (
    platform === 'web' &&
    (moduleName === '@stripe/stripe-react-native' ||
      moduleName.startsWith('@stripe/stripe-react-native/') ||
      moduleName === '@stripe/crypto' ||
      moduleName.startsWith('@stripe/crypto/'))
  ) {
    return { type: 'empty' }
  }
  if (
    moduleName === '@easner/shared/currency-flag' ||
    moduleName === '@easner/shared/src/components/CountryFlag.native'
  ) {
    return { type: 'sourceFile', filePath: sharedCurrencyFlagNative }
  }
  const origin = context.originModulePath ?? ''
  if (
    origin.includes(`${path.sep}mobile${path.sep}`) &&
    (moduleName === '@easner/shared/src/components/CountryFlag' ||
      moduleName.endsWith('/components/CountryFlag'))
  ) {
    return { type: 'sourceFile', filePath: sharedCurrencyFlagNative }
  }
  if (
    moduleName === './lib-address/country-registration' ||
    moduleName.endsWith('/lib-address/country-registration')
  ) {
    return { type: 'sourceFile', filePath: sharedCountryRegistrationNative }
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
