import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
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
      { source: "/business", destination: "/businesses", permanent: true },
      { source: "/business/organizations", destination: "/businesses", permanent: true },
      { source: "/organizations", destination: "/businesses", permanent: true },
      { source: "/organizations/:path*", destination: "/businesses/:path*", permanent: true },
      { source: "/business/customers", destination: "/customers", permanent: true },
      { source: "/business/invoices", destination: "/invoices", permanent: true },
    ]
  },
  transpilePackages: ["@easner/shared"],
  compress: true,
  images: {
    unoptimized: true,
    formats: ['image/webp', 'image/avif'],
  },
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  turbopack: {
    root: resolve(__dirname, ".."),
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@easner/shared": resolve(__dirname, "../packages/shared/src/index.ts"),
    }
    config.resolve.modules.unshift(resolve(__dirname, "../node_modules"))
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },
}

export default nextConfig
