/**
 * iOS production builds crash on launch when receipt capture native modules link
 * at startup (react-native-view-shot TurboModule registration; expo-media-library
 * also absent from the last known-good iOS build). Android keeps both for PNG + gallery save.
 */
module.exports = {
  dependencies: {
    'react-native-view-shot': {
      platforms: {
        ios: null,
      },
    },
    'expo-media-library': {
      platforms: {
        ios: null,
      },
    },
  },
}
