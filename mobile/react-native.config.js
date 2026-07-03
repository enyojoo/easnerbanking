/**
 * iOS production builds crash on launch when react-native-view-shot is linked (New Arch
 * TurboModule registration). Android keeps view-shot; iOS uses easner-view-capture instead.
 */
module.exports = {
  dependencies: {
    'react-native-view-shot': {
      platforms: {
        ios: null,
      },
    },
  },
}
