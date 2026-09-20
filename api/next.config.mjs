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
  compress: true,
  outputFileTracingRoot: resolve(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/statements/pdf": ["../business/assets/statement-fonts/**"],
    "/api/statements/pdf/route": ["../business/assets/statement-fonts/**"],
  },
  transpilePackages: ["@easner/server", "@easner/shared", "@sumsub/websdk"],
  turbopack: {
    root: resolve(__dirname, ".."),
    resolveAlias: {
      "@/app/api": "./app/api",
      "@": "../business",
      "@easner/shared": "../packages/shared/src/index.ts",
      "@easner/shared/verified-identity": "../packages/shared/src/verified-identity.ts",
      "@easner/server": "../packages/server/lib/index.ts",
      "lib-address": "../node_modules/lib-address/dist/entry-browser.mjs",
    },
  },
  experimental: {
    externalDir: true,
    optimizePackageImports: ["@easner/shared", "date-fns", "lucide-react", "zod"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/app/api": resolve(__dirname, "app/api"),
      "@": resolve(__dirname, "../business"),
      "@easner/shared$": resolve(__dirname, "../packages/shared/src/index.ts"),
      "@easner/shared/verified-identity": resolve(
        __dirname,
        "../packages/shared/src/verified-identity.ts"
      ),
      "@easner/server": resolve(__dirname, "../packages/server/lib/index.ts"),
      "@radix-ui/react-slot": resolve(__dirname, "../node_modules/@radix-ui/react-slot"),
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
      "lib-address$": resolve(__dirname, "../node_modules/lib-address/dist/entry-browser.mjs"),
    }
    return config
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@noble/ciphers",
    "@noble/curves",
    "@noble/hashes",
    "@solana/web3.js",
    "@solana/spl-token",
    "@turnkey/sdk-server",
    "stripe",
    "posthog-js",
  ],
  async rewrites() {
    const jsHosts = [...new Set(["js.easner.com", hostnameFromOrigin(process.env.NEXT_PUBLIC_EASNER_JS_HOST, "js.easner.com")])]
      .filter((host) => host === "js.easner.com" || host.startsWith("js."))
    const apiHosts = [...new Set(["api.easner.com", hostnameFromOrigin(process.env.NEXT_PUBLIC_EASNER_API_HOST, "api.easner.com")])]
      .filter((host) => host === "api.easner.com" || host.startsWith("api."))
    return {
      beforeFiles: [
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
      ],
    }
  },
}

export default nextConfig
