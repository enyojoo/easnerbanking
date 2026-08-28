const { withAndroidManifest } = require('expo/config-plugins')

/** Play policy: use system photo picker; do not declare broad READ_MEDIA_* access (API 33+). */
const BLOCKED = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
]

const withAndroidBlockedMediaReadPermissions = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest
    const permissions = manifest['uses-permission'] ?? []
    const list = (Array.isArray(permissions) ? permissions : [permissions]).filter(
      (entry) => !BLOCKED.includes(entry?.$?.['android:name']),
    )
    manifest['uses-permission'] = list
    return config
  })

module.exports = withAndroidBlockedMediaReadPermissions
