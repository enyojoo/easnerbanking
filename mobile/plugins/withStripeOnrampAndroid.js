const { withProjectBuildGradle } = require('expo/config-plugins')

/**
 * Stripe React Native 0.64+ ships Crypto Onramp behind an Android opt-in.
 * Without this, `useOnramp()` throws at runtime.
 */
const FLAG = 'StripeSdk_includeOnramp'

const withStripeOnrampAndroid = (config) =>
  withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents
    if (contents.includes(FLAG)) return config

    if (/ext\s*\{/.test(contents)) {
      contents = contents.replace(/ext\s*\{/, `ext {\n    ${FLAG} = true`)
    } else {
      contents = `ext {\n    ${FLAG} = true\n}\n\n${contents}`
    }

    config.modResults.contents = contents
    return config
  })

module.exports = withStripeOnrampAndroid
