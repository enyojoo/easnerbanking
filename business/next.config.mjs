import fs from "fs"
import path from "path"
import { createRequire } from "module"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo root — workspace deps are hoisted here; Turbopack must resolve this tree on Vercel. */
const monorepoRoot = path.join(__dirname, "..")
const businessRoot = __dirname

function resolveWorkspacePackageDir(packageName, workspaceDir) {
  const segments = packageName.split("/")
  const dirsToTry = [
    path.join(workspaceDir, "node_modules", ...segments),
    path.join(monorepoRoot, "node_modules", ...segments),
  ]
  for (const dir of dirsToTry) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir
    }
  }
  const requireCandidates = [
    path.join(workspaceDir, "package.json"),
    path.join(monorepoRoot, "package.json"),
  ]
  for (const manifest of requireCandidates) {
    if (!fs.existsSync(manifest)) continue
    const req = createRequire(manifest)
    try {
      const resolved = req.resolve(`${packageName}/package.json`)
      return path.dirname(resolved)
    } catch {
      try {
        const entry = req.resolve(packageName)
        let dir = path.dirname(entry)
        for (let i = 0; i < 14; i++) {
          const pj = path.join(dir, "package.json")
          if (fs.existsSync(pj)) {
            try {
              const meta = JSON.parse(fs.readFileSync(pj, "utf8"))
              if (meta.name === packageName) return dir
            } catch {
              /* invalid json */
            }
          }
          const up = path.dirname(dir)
          if (up === dir) break
          dir = up
        }
      } catch {
        /* try next manifest */
      }
    }
  }
  throw new Error(
    `[business/next.config] Cannot resolve "${packageName}". Tried: ${dirsToTry.join(", ")}`,
  )
}

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
      path.join(businessRoot, "node_modules"),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : ["node_modules"]),
    ]
    const supabaseJsDir = resolveWorkspacePackageDir("@supabase/supabase-js", businessRoot)
    const supabaseSsrDir = resolveWorkspacePackageDir("@supabase/ssr", businessRoot)
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
