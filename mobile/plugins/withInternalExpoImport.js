const { withAppDelegate } = require('expo/config-plugins')

/**
 * SDK 56+ ExpoModulesProvider uses `internal import` for autolinked modules.
 * AppDelegate must use `internal import Expo` and a non-public AppDelegate class
 * (see expo-template-bare-minimum).
 */
const withInternalExpoImport = (config) =>
  withAppDelegate(config, (config) => {
    let contents = config.modResults.contents

    if (!contents.includes('internal import Expo')) {
      contents = contents.replace(/^import Expo$/m, 'internal import Expo')
    }

    contents = contents
      .replace(/@UIApplicationMain\npublic class AppDelegate/g, '@main\nclass AppDelegate')
      .replace(/@UIApplicationMain\nclass AppDelegate/g, '@main\nclass AppDelegate')
      .replace(/@main\npublic class AppDelegate/g, '@main\nclass AppDelegate')
      .replace(/\n\s*bindReactNativeFactory\(factory\)\n/, '\n')

    config.modResults.contents = contents
    return config
  })

module.exports = withInternalExpoImport
