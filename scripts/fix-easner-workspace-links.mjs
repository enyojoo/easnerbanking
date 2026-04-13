import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const scopeDir = path.join(root, "node_modules", "@easner")

const links = [
  { name: "shared", target: path.join(root, "packages", "shared") },
  { name: "server", target: path.join(root, "packages", "server") },
]

function ensureSymlink(linkName, absoluteTarget) {
  if (!fs.existsSync(absoluteTarget)) return
  fs.mkdirSync(scopeDir, { recursive: true })
  const linkPath = path.join(scopeDir, linkName)
  const relTarget = path.relative(scopeDir, absoluteTarget)
  try {
    const current = fs.readlinkSync(linkPath)
    const resolved = path.resolve(scopeDir, current)
    if (resolved === absoluteTarget) return
  } catch {
    /* missing or not a symlink */
  }
  try {
    fs.unlinkSync(linkPath)
  } catch {
    /* noop */
  }
  fs.symlinkSync(relTarget, linkPath)
}

function linkEasnerWorkspacePackages() {
  for (const { name, target } of links) {
    ensureSymlink(name, target)
  }
}

linkEasnerWorkspacePackages()

/** Dedupe React type packages so Radix / Next see one @types/react (avoids Slot + layout TS errors). */
const nestedTypes = [
  path.join(root, "office", "node_modules", "@types", "react"),
  path.join(root, "office", "node_modules", "@types", "react-dom"),
  path.join(root, "business", "node_modules", "@types", "react"),
  path.join(root, "business", "node_modules", "@types", "react-dom"),
]
for (const p of nestedTypes) {
  try {
    fs.rmSync(p, { recursive: true, force: true })
  } catch {
    /* noop */
  }
}

/**
 * Vercel sometimes leaves root `dependencies` incomplete after `npm install` (e.g. `@supabase/ssr`
 * missing while `@supabase/supabase-js` is present). Self-heal once so Next/webpack can resolve.
 */
if (process.env.VERCEL === "1") {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  const deps = { ...rootPkg.dependencies, ...rootPkg.devDependencies }
  const supabasePkgs = [
    { name: "@supabase/supabase-js", pkgJson: path.join(root, "node_modules", "@supabase", "supabase-js", "package.json") },
    { name: "@supabase/ssr", pkgJson: path.join(root, "node_modules", "@supabase", "ssr", "package.json") },
  ]
  const missingSpecs = []
  for (const { name, pkgJson } of supabasePkgs) {
    if (!fs.existsSync(pkgJson)) {
      const spec = deps[name]
      if (spec) missingSpecs.push(`${name}@${spec}`)
    }
  }
  if (missingSpecs.length > 0) {
    console.warn("[easner] VERCEL postinstall: installing missing:", missingSpecs.join(" "))
    const r = spawnSync("npm", ["install", ...missingSpecs, "--no-audit", "--no-fund"], {
      cwd: root,
      stdio: "inherit",
    })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  for (const { name, pkgJson } of supabasePkgs) {
    if (!fs.existsSync(pkgJson)) {
      console.error("[easner] VERCEL postinstall: still missing after npm install:", name, pkgJson)
      process.exit(1)
    }
  }
}

/** Nested `npm install` (Supabase self-heal) can prune `node_modules/@easner`; re-link workspace packages. */
linkEasnerWorkspacePackages()
