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

for (const { name, target } of links) {
  ensureSymlink(name, target)
}

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
