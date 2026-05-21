const { withAndroidManifest } = require('@expo/config-plugins')

/**
 * Resolve WRITE_EXTERNAL_STORAGE maxSdkVersion conflict between expo-file-system (32)
 * and Intercom SDK (28) during manifest merge on release builds.
 */
const withWriteExternalStorageMaxSdk = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest
    const permissions = manifest['uses-permission'] ?? []
    const list = Array.isArray(permissions) ? permissions : [permissions]

    const writePerm = 'android.permission.WRITE_EXTERNAL_STORAGE'
    let found = false

    for (const entry of list) {
      if (entry?.$?.['android:name'] !== writePerm) continue
      found = true
      entry.$['android:maxSdkVersion'] = '32'
      entry.$['tools:replace'] = 'android:maxSdkVersion'
    }

    if (!found) {
      list.push({
        $: {
          'android:name': writePerm,
          'android:maxSdkVersion': '32',
          'tools:replace': 'android:maxSdkVersion',
        },
      })
    }

    manifest['uses-permission'] = list
    return config
  })

module.exports = withWriteExternalStorageMaxSdk
