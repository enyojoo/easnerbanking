import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo root — workspace deps are hoisted here; Turbopack must resolve this tree on Vercel. */
const monorepoRoot = path.join(__dirname, "..")

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@easner/server"],
  turbopack: {
    root: monorepoRoot,
  },
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "api.easner.com" }],
        destination: "https://business.easner.com/",
        permanent: false,
      },
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