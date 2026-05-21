const { withAppDelegate } = require('@expo/config-plugins')

/**
 * SDK 56+ ExpoModulesProvider uses `internal import` for autolinked modules.
 * AppDelegate must use `internal import Expo` to match (see expo-template-bare-minimum).
 */
const withInternalExpoImport = (config) =>
  withAppDelegate(config, (config) => {
    let contents = config.modResults.contents

    if (!contents.includes('internal import Expo')) {
      contents = contents.replace(/^import Expo$/m, 'internal import Expo')
    }

    contents = contents.replace(/\n\s*bindReactNativeFactory\(factory\)\n/, '\n')

    config.modResults.contents = contents
    return config
  })

module.exports = withInternalExpoImport
