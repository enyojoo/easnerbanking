import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: resolve(__dirname, ".."),
  },
  transpilePackages: ["@easner/server", "@easner/shared"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@easner/shared": resolve(__dirname, "../packages/shared/src/index.ts"),
      "@easner/server": resolve(__dirname, "../packages/server/lib/index.ts"),
      "@radix-ui/react-slot": resolve(
        __dirname,
        "../node_modules/@radix-ui/react-tooltip/node_modules/@radix-ui/react-slot"
      ),
      "@noble/hashes": resolve(__dirname, "../node_modules/@turnkey/crypto/node_modules/@noble/hashes"),
      "@noble/hashes/utils": resolve(
        __dirname,
        "../node_modules/@turnkey/crypto/node_modules/@noble/hashes/utils.js"
      ),
      "@noble/hashes/utils.js": resolve(
        __dirname,
        "../node_modules/@turnkey/crypto/node_modules/@noble/hashes/utils.js"
      ),
      "@noble/hashes/hkdf": resolve(
        __dirname,
        "../node_modules/@turnkey/crypto/node_modules/@noble/hashes/hkdf.js"
      ),
      "@noble/hashes/hkdf.js": resolve(
        __dirname,
        "../node_modules/@turnkey/crypto/node_modules/@noble/hashes/hkdf.js"
      ),
      "@noble/hashes/sha256": resolve(
        __dirname,
        "../node_modules/@turnkey/crypto/node_modules/@noble/hashes/sha256.js"
      ),
      "@noble/hashes/sha256.js": resolve(
        __dirname,
        "../node_modules/@turnkey/crypto/node_modules/@noble/hashes/sha256.js"
      ),
    }
    return config
  },
  async redirects() {
    return [
      { source: "/verification", destination: "/settings?tab=business", permanent: false },
      { source: "/autopayout", destination: "/qr-pay", permanent: true },
      { source: "/autopayout/:path*", destination: "/qr-pay/:path*", permanent: true },
    ]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@react-pdf/renderer"],
}

export default nextConfig
