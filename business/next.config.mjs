import path from "path"
import { createRequire } from "module"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo root — workspace deps are hoisted here; Turbopack must resolve this tree on Vercel. */
const monorepoRoot = path.join(__dirname, "..")

/** Hoisted deps under repo root; webpack must resolve them on Vercel (sparse business/node_modules). */
const rootRequire = createRequire(path.join(monorepoRoot, "package.json"))
function resolvePkgDir(specifier, fallbackSegments) {
  try {
    return path.dirname(rootRequire.resolve(`${specifier}/package.json`))
  } catch {
    return path.join(monorepoRoot, "node_modules", ...fallbackSegments)
  }
}
const supabaseJsDir = resolvePkgDir("@supabase/supabase-js", ["@supabase", "supabase-js"])
const supabaseSsrDir = resolvePkgDir("@supabase/ssr", ["@supabase", "ssr"])

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
    remotePatterns: [
      { protocol: "https", hostname: "seeqjiebmrnolcyydewj.supabase.co", pathname: "/**" },
      { protocol: "https", hostname: "*.supabase.co", pathname: "/**" },
      { protocol: "https", hostname: "raw.githubusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "logo.svgcdn.com", pathname: "/**" },
      { protocol: "https", hostname: "assets.coingecko.com", pathname: "/**" },
    ],
  },
  serverExternalPackages: ["@react-pdf/renderer"],
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {}
    config.resolve.modules = [
      path.join(monorepoRoot, "node_modules"),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : ["node_modules"]),
    ]
    config.resolve.alias = {
      ...config.resolve.alias,
      "@supabase/supabase-js": supabaseJsDir,
      "@supabase/ssr": supabaseSsrDir,
    }
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