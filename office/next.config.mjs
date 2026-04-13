import fs from "fs"
import path from "path"
import { createRequire } from "module"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo root — npm hoists workspace deps here; Turbopack must resolve from this tree (e.g. Vercel). */
const monorepoRoot = path.join(__dirname, "..")
const officeRoot = __dirname

/**
 * Resolve a package directory for webpack. Prefer the workspace that declares the dependency (office);
 * fall back to repo root (root now also lists @supabase/supabase-js so createRequire(root) works on CI).
 */
function resolveHoistedPackageDir(packageName) {
  const hoisted = path.join(monorepoRoot, "node_modules", ...packageName.split("/"))
  if (fs.existsSync(path.join(hoisted, "package.json"))) {
    return hoisted
  }
  const requireCandidates = [
    path.join(officeRoot, "package.json"),
    path.join(monorepoRoot, "package.json"),
  ]
  for (const manifest of requireCandidates) {
    if (!fs.existsSync(manifest)) continue
    try {
      const req = createRequire(manifest)
      const resolved = req.resolve(`${packageName}/package.json`)
      return path.dirname(resolved)
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `[office/next.config] Cannot resolve "${packageName}". Expected at ${hoisted} or via npm workspaces.`,
  )
}

/** Webpack may use alias as object or array depending on Next version. */
function ensureAlias(config, name, aliasPath) {
  config.resolve = config.resolve ?? {}
  const existing = config.resolve.alias
  if (Array.isArray(existing)) {
    existing.push({ name, alias: aliasPath })
    return
  }
  config.resolve.alias = {
    ...(existing && typeof existing === "object" ? existing : {}),
    [name]: aliasPath,
  }
}

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
    optimizePackageImports: ["lucide-react"],
  },
  turbopack: {
    root: monorepoRoot,
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {}
    config.resolve.symlinks = true
    config.resolve.modules = [
      path.join(monorepoRoot, "node_modules"),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : ["node_modules"]),
    ]

    const supabaseJsDir = resolveHoistedPackageDir("@supabase/supabase-js")
    ensureAlias(config, "@supabase/supabase-js", supabaseJsDir)

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
