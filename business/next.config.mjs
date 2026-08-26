import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const nobleHashesRoot = resolve(__dirname, "../node_modules/@noble/hashes")
const nobleHashesSubpath = (name) => resolve(nobleHashesRoot, `${name}.js`)
const nobleCurvesRoot = resolve(__dirname, "../node_modules/@noble/curves")
const nobleCurvesSubpath = (name) => resolve(nobleCurvesRoot, `${name}.js`)
const nobleCiphersRoot = resolve(__dirname, "../node_modules/@noble/ciphers")
const nobleCiphersSubpath = (name) => resolve(nobleCiphersRoot, `${name}.js`)

function hostnameFromOrigin(raw, fallback) {
  const value = typeof raw === "string" ? raw.trim() : ""
  try {
    return new URL(value || `https://${fallback}`).hostname.toLowerCase()
  } catch {
    return fallback
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  staticPageGenerationTimeout: 180,
  outputFileTracingRoot: resolve(__dirname, ".."),
  outputFileTracingIncludes: {
    "/og/customer/[[...slug]]": [
      "./assets/easner-logo.png",
      "./assets/og-fonts/**",
    ],
    "/og/customer/[[...slug]]/route": [
      "./assets/easner-logo.png",
      "./assets/og-fonts/**",
    ],
    "/og/pay/opengraph-image": [
      "./assets/easner-logo.png",
      "./assets/og-fonts/**",
    ],
    "/og/invoice/opengraph-image": [
      "./assets/easner-logo.png",
      "./assets/og-fonts/**",
    ],
    "/og/pay/thanks/opengraph-image": [
      "./assets/easner-logo.png",
      "./assets/og-fonts/**",
    ],
  },
  transpilePackages: ["@easner/server", "@easner/shared", "@sumsub/websdk"],
  /**
   * Dev runs Turbopack (`next dev --turbo`) but production builds with
   * webpack, and the `webpack:` alias block below is silently ignored by
   * Turbopack — so dev and prod resolved these modules differently and local
   * perf work didn't reflect production. Mirror the load-bearing aliases.
   * (@noble/hashes subpath aliases are a webpack-only workaround for the npm
   * override hoist; Turbopack resolves them via package `exports`.)
   */
  turbopack: {
    root: resolve(__dirname, ".."),
    resolveAlias: {
      "@easner/shared": "../packages/shared/src/index.ts",
      "@easner/shared/verified-identity": "../packages/shared/src/verified-identity.ts",
      "@easner/server": "../packages/server/lib/index.ts",
      "lib-address": "../node_modules/lib-address/dist/entry-browser.mjs",
    },
  },
  experimental: {
    // The @easner/shared barrel fronts ~26k lines behind 193 exports; without
    // this, importing one helper pulls the whole graph into the bundle.
    optimizePackageImports: ["@easner/shared", "date-fns"],
    // Router-cache lifetimes: prefetched static shells stay usable for the
    // session; without this, dynamic payloads are discarded instantly and
    // every navigation re-pays a server round trip.
    staleTimes: {
      static: 1800,
      dynamic: 30,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Exact match only – a bare `@easner/shared` prefix would swallow subpath imports.
      "@easner/shared$": resolve(__dirname, "../packages/shared/src/index.ts"),
      "@easner/shared/verified-identity": resolve(
        __dirname,
        "../packages/shared/src/verified-identity.ts"
      ),
      "@easner/server": resolve(__dirname, "../packages/server/lib/index.ts"),
      "@radix-ui/react-slot": resolve(__dirname, "../node_modules/@radix-ui/react-slot"),
      // npm overrides hoist @noble/hashes to the workspace root; webpack needs explicit subpaths.
      // Same for curves/ciphers (Turnkey + Solana) once they are hoisted next to hashes.
      "@noble/hashes": nobleHashesRoot,
      "@noble/hashes/utils": nobleHashesSubpath("utils"),
      "@noble/hashes/utils.js": nobleHashesSubpath("utils"),
      "@noble/hashes/hkdf": nobleHashesSubpath("hkdf"),
      "@noble/hashes/hkdf.js": nobleHashesSubpath("hkdf"),
      "@noble/hashes/sha256": nobleHashesSubpath("sha256"),
      "@noble/hashes/sha256.js": nobleHashesSubpath("sha256"),
      "@noble/hashes/sha3": nobleHashesSubpath("sha3"),
      "@noble/hashes/sha3.js": nobleHashesSubpath("sha3"),
      "@noble/hashes/hmac": nobleHashesSubpath("hmac"),
      "@noble/hashes/hmac.js": nobleHashesSubpath("hmac"),
      "@noble/curves": nobleCurvesRoot,
      "@noble/curves/ed25519": nobleCurvesSubpath("ed25519"),
      "@noble/curves/ed25519.js": nobleCurvesSubpath("ed25519"),
      "@noble/curves/secp256k1": nobleCurvesSubpath("secp256k1"),
      "@noble/curves/secp256k1.js": nobleCurvesSubpath("secp256k1"),
      "@noble/curves/p256": nobleCurvesSubpath("p256"),
      "@noble/curves/p256.js": nobleCurvesSubpath("p256"),
      "@noble/curves/nist": nobleCurvesSubpath("nist"),
      "@noble/curves/nist.js": nobleCurvesSubpath("nist"),
      "@noble/curves/utils": nobleCurvesSubpath("utils"),
      "@noble/curves/utils.js": nobleCurvesSubpath("utils"),
      "@noble/ciphers": nobleCiphersRoot,
      "@noble/ciphers/aes": nobleCiphersSubpath("aes"),
      "@noble/ciphers/aes.js": nobleCiphersSubpath("aes"),
      "@noble/ciphers/utils": nobleCiphersSubpath("utils"),
      "@noble/ciphers/utils.js": nobleCiphersSubpath("utils"),
      "@noble/ciphers/chacha": nobleCiphersSubpath("chacha"),
      "@noble/ciphers/chacha.js": nobleCiphersSubpath("chacha"),
      "@noble/ciphers/crypto": nobleCiphersSubpath("crypto"),
      "@noble/ciphers/crypto.js": nobleCiphersSubpath("crypto"),
      // Exact match only – a prefix alias breaks `lib-address/countries/*.json` lazy imports.
      "lib-address$": resolve(__dirname, "../node_modules/lib-address/dist/entry-browser.mjs"),
    }
    return config
  },
  async headers() {
    return [
      {
        source: "/flags/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kixymrjsupzkxokujmwu.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "seeqjiebmrnolcyydewj.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@noble/ciphers",
    "@noble/curves",
    "@noble/hashes",
  ],
  async rewrites() {
    const payHosts = [...new Set(["pay.easner.com", hostnameFromOrigin(process.env.NEXT_PUBLIC_PAY_APP_URL, "pay.easner.com")])]
      .filter((host) => host === "pay.easner.com" || host.startsWith("pay."))
    const invoiceHosts = [...new Set(["invoice.easner.com", hostnameFromOrigin(process.env.NEXT_PUBLIC_INVOICE_APP_URL, "invoice.easner.com")])]
      .filter((host) => host === "invoice.easner.com" || host.startsWith("invoice."))
    const skip =
      "api|_next|auth|pay-customer|invoice|og|favicon.ico|robots.txt|manifest.webmanifest|checkout.js|crypto-onramp|v1"
    const jsHosts = [...new Set(["js.easner.com", hostnameFromOrigin(process.env.NEXT_PUBLIC_EASNER_JS_HOST, "js.easner.com")])]
      .filter((host) => host === "js.easner.com" || host.startsWith("js."))
    const apiHosts = [...new Set(["api.easner.com", hostnameFromOrigin(process.env.NEXT_PUBLIC_EASNER_API_HOST, "api.easner.com")])]
      .filter((host) => host === "api.easner.com" || host.startsWith("api."))
    return {
      beforeFiles: [
        {
          source: "/crypto-onramp/:path*",
          destination: "https://js.stripe.com/crypto-onramp/:path*",
        },
        {
          source: "/v1/checkout.js",
          destination: "/checkout.js",
        },
        {
          source: "/v1/:path*",
          destination: "/api/v1/:path*",
        },
        ...apiHosts.map((host) => ({
          source: "/v1/:path*",
          has: [{ type: "host", value: host }],
          destination: "/api/v1/:path*",
        })),
        ...jsHosts.flatMap((host) => [
          {
            source: "/v1/checkout.js",
            has: [{ type: "host", value: host }],
            destination: "/checkout.js",
          },
          {
            source: "/:version/checkout.js",
            has: [{ type: "host", value: host }],
            destination: "/checkout.js",
          },
        ]),
        ...payHosts.map((host) => ({
          source: `/((?!${skip}).*)`,
          has: [{ type: "host", value: host }],
          destination: "/pay-customer/$1",
        })),
        ...invoiceHosts.map((host) => ({
          source: `/((?!${skip}).*)`,
          has: [{ type: "host", value: host }],
          destination: "/invoice/$1",
        })),
      ],
    }
  },
}

export default nextConfig
