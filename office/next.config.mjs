import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo root — npm hoists workspace deps here; Turbopack must resolve from this tree (e.g. Vercel). */
const monorepoRoot = path.join(__dirname, "..")

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    formats: ["image/webp", "image/avif"],
    remotePatterns: [
      { protocol: "https", hostname: "seeqjiebmrnolcyydewj.supabase.co", pathname: "/**" },
      { protocol: "https", hostname: "*.supabase.co", pathname: "/**" },
      { protocol: "https", hostname: "raw.githubusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "logo.svgcdn.com", pathname: "/**" },
    ],
  },
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  turbopack: {
    root: monorepoRoot,
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
