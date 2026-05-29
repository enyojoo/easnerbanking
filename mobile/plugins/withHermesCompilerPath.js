const { withAppBuildGradle } = require('expo/config-plugins')

/**
 * RN 0.83+ ships hermesc via the `hermes-compiler` package, not react-native/sdks/hermesc.
 * @see https://github.com/expo/expo/issues/42056
 */
const withHermesCompilerPath = (config) =>
  withAppBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents

    const newHermesCommand = `try {
    hermesCommand = new File(["node", "--print", "require.resolve('hermes-compiler/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"
} catch (Exception e) {
    hermesCommand = new File(["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/sdks/hermesc/%OS-BIN%/hermesc"
}`

    const hermesBlockPattern =
      /[ \t]*try\s*\{[\s\S]*?require\.resolve\('hermes-compiler\/package\.json'\)[\s\S]*?\} catch \(Exception e\) \{[\s\S]*?\}/

    const oldPattern =
      /hermesCommand\s*=\s*new File\(\["node",.*?"require\.resolve\('react-native\/package\.json'\)"\]\.execute\(null, rootDir\)\.text\.trim\(\)\)\.getParentFile\(\)\.getAbsolutePath\(\)\s*\+\s*"\/sdks\/hermesc\/%OS-BIN%\/hermesc"/

    if (hermesBlockPattern.test(buildGradle)) {
      buildGradle = buildGradle.replace(hermesBlockPattern, newHermesCommand)
    } else if (oldPattern.test(buildGradle)) {
      buildGradle = buildGradle.replace(oldPattern, newHermesCommand)
    } else if (!buildGradle.includes("require.resolve('hermes-compiler/package.json')")) {
      buildGradle = buildGradle.replace(
        /(react\s*\{)/,
        `$1\n    ${newHermesCommand.split('\n').join('\n    ')}`,
      )
    }

    config.modResults.contents = buildGradle
    return config
  })

module.exports = withHermesCompilerPath
