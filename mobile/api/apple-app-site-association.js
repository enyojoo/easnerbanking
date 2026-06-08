const MOBILE_BUNDLE_ID = 'com.easner.mobile'

function buildAppleAppSiteAssociation(teamId) {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${teamId}.${MOBILE_BUNDLE_ID}`],
          components: [
            {
              '/': '/auth/callback*',
              comment:
                'Supabase OAuth / magic link return (AuthContext handles; do not open in Safari)',
            },
            {
              '/': '/user/*',
              comment: 'In-app deep-link paths mapped in mobile DeepLinkService',
            },
            {
              '/': '*',
              exclude: true,
              comment: 'Web app and other paths stay in browser unless explicitly listed',
            },
          ],
        },
      ],
    },
  }
}

module.exports = (_req, res) => {
  const teamId = process.env.APPLE_TEAM_ID
  if (!teamId) {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ error: 'APPLE_TEAM_ID is not configured' })
    return
  }

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).json(buildAppleAppSiteAssociation(teamId))
}
