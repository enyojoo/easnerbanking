const path = require('path')

module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
          alias: {
            // Subpaths must precede `@easner/shared` — otherwise module-resolver maps
            // `@easner/shared/currency-flag` → `packages/shared/currency-flag` (missing).
            '@easner/shared/warm-flags': path.resolve(
              __dirname,
              '../packages/shared/src/flags/warm-flags.native',
            ),
            '@easner/shared/currency-flag': path.resolve(
              __dirname,
              '../packages/shared/src/components/CountryFlag.native',
            ),
            // Monorepo: shared package source (not only root node_modules).
            '@easner/shared': path.resolve(__dirname, '../packages/shared'),
            // @noble/hashes: do not alias here — subpath imports like `@noble/hashes/pbkdf2.js`
            // must resolve via package `exports` (see mobile/metro.config.js extraNodeModules).
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  }
}
