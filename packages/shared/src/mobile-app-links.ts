const MOBILE_BUNDLE_ID = "com.easner.mobile"

export function buildAppleAppSiteAssociation(teamId: string) {
  return {
    applinks: {
      apps: [] as string[],
      details: [
        {
          appIDs: [`${teamId}.${MOBILE_BUNDLE_ID}`],
          components: [
            {
              "/": "/auth/callback*",
              comment:
                "Supabase OAuth / magic link return (AuthContext handles; do not open in Safari)",
            },
            {
              "/": "/user/*",
              comment: "In-app deep-link paths mapped in mobile DeepLinkService",
            },
            {
              "/": "*",
              exclude: true,
              comment: "Web app and other paths stay in browser unless explicitly listed",
            },
          ],
        },
      ],
    },
  }
}

export function buildAssetLinks(fingerprints: string[]) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: MOBILE_BUNDLE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]
}
