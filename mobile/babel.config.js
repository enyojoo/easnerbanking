const fs = require('fs')
const path = require('path')

function firstExistingDir(...candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

const nobleHashesRoot = firstExistingDir(
  path.join(__dirname, 'node_modules', '@noble', 'hashes'),
  path.join(__dirname, '..', 'node_modules', '@noble', 'hashes'),
)

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
            // Monorepo: Metro can miss hoisted workspace / root deps; Babel rewrites imports.
            '@easner/shared': path.resolve(__dirname, '../packages/shared'),
            '@noble/hashes': nobleHashesRoot,
          },
        },
      ],
    ],
  }
}
