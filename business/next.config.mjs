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
    config.resolve.modules.unshift(resolve(__dirname, "../node_modules"))
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