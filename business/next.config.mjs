import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const nobleHashesRoot = resolve(__dirname, "../node_modules/@noble/hashes")
const nobleHashesSubpath = (name) => resolve(nobleHashesRoot, `${name}.js`)

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: resolve(__dirname, ".."),
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
  async redirects() {
    return [
      { source: "/verification", destination: "/settings?tab=verification", permanent: false },
      { source: "/autopayout", destination: "/qr-pay", permanent: true },
      { source: "/autopayout/:path*", destination: "/qr-pay/:path*", permanent: true },
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
}

export default nextConfig
