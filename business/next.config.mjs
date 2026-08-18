import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const nobleHashesRoot = resolve(__dirname, "../node_modules/@noble/hashes")
const nobleHashesSubpath = (name) => resolve(nobleHashesRoot, `${name}.js`)

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
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Exact match only — a bare `@easner/shared` prefix would swallow subpath imports.
      "@easner/shared$": resolve(__dirname, "../packages/shared/src/index.ts"),
      "@easner/shared/verified-identity": resolve(
        __dirname,
        "../packages/shared/src/verified-identity.ts"
      ),
      "@easner/server": resolve(__dirname, "../packages/server/lib/index.ts"),
      "@radix-ui/react-slot": resolve(__dirname, "../node_modules/@radix-ui/react-slot"),
      // npm overrides hoist @noble/hashes to the workspace root; webpack needs explicit subpaths.
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
      // Exact match only — a prefix alias breaks `lib-address/countries/*.json` lazy imports.
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
  serverExternalPackages: ["@react-pdf/renderer"],
  async rewrites() {
    const payHosts = [...new Set(["pay.easner.com", hostnameFromOrigin(process.env.NEXT_PUBLIC_PAY_APP_URL, "pay.easner.com")])]
      .filter((host) => host === "pay.easner.com" || host.startsWith("pay."))
    const invoiceHosts = [...new Set(["invoice.easner.com", hostnameFromOrigin(process.env.NEXT_PUBLIC_INVOICE_APP_URL, "invoice.easner.com")])]
      .filter((host) => host === "invoice.easner.com" || host.startsWith("invoice."))
    const skip =
      "api|_next|auth|pay-customer|invoice|og|favicon.ico|robots.txt|manifest.webmanifest|checkout.js"
    return {
      beforeFiles: [
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
