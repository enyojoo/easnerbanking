const { withAndroidManifest } = require('@expo/config-plugins')

/** Expo FileSystem (32) vs Intercom (28) maxSdkVersion conflicts on storage permissions. */
const STORAGE_PERMS = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]

const withAndroidStoragePermissionsMaxSdk = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest
    const permissions = manifest['uses-permission'] ?? []
    const list = Array.isArray(permissions) ? permissions : [permissions]

    for (const permName of STORAGE_PERMS) {
      let found = false
      for (const entry of list) {
        if (entry?.$?.['android:name'] !== permName) continue
        found = true
        entry.$['android:maxSdkVersion'] = '32'
        entry.$['tools:replace'] = 'android:maxSdkVersion'
      }
      if (!found) {
        list.push({
          $: {
            'android:name': permName,
            'android:maxSdkVersion': '32',
            'tools:replace': 'android:maxSdkVersion',
          },
        })
      }
    }

    manifest['uses-permission'] = list
    return config
  })

module.exports = withAndroidStoragePermissionsMaxSdk
