const MOBILE_BUNDLE_ID = 'com.easner.mobile'

function buildAssetLinks(fingerprints) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: MOBILE_BUNDLE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]
}

module.exports = (_req, res) => {
  const raw = process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? ''
  const fingerprints = raw
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)

  if (fingerprints.length === 0) {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ error: 'ANDROID_SHA256_CERT_FINGERPRINTS is not configured' })
    return
  }

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).json(buildAssetLinks(fingerprints))
}
