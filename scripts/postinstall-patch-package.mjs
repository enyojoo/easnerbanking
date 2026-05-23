#!/usr/bin/env node
/**
 * Apply patch-package only when patched dependencies are installed.
 * Office-only Vercel installs omit business/Solana deps (e.g. bigint-buffer).
 */
import { execSync } from "node:child_process"
import { createRequire } from "node:module"
import { existsSync, readdirSync } from "node:fs"

const require = createRequire(import.meta.url)
import { join } from "node:path"

const patchesDir = join(process.cwd(), "patches")
if (!existsSync(patchesDir)) {
  process.exit(0)
}

function packageNameFromPatchFile(filename) {
  const base = filename.replace(/\.patch$/, "")
  const parts = base.split("+")
  if (parts.length < 2) return null
  parts.pop()
  if (parts.length === 1) return parts[0]
  const scope = parts[0]
  if (!scope.startsWith("@")) return parts.join("+")
  return `${scope}/${parts.slice(1).join("+")}`
}

const patchFiles = readdirSync(patchesDir).filter((f) => f.endsWith(".patch"))
const applicable = patchFiles.filter((file) => {
  const pkg = packageNameFromPatchFile(file)
  if (!pkg) return false
  return existsSync(join(process.cwd(), "node_modules", pkg))
})

if (applicable.length === 0) {
  if (patchFiles.length > 0) {
    console.log("patch-package: skipped (no patched packages in this install)")
  }
  process.exit(0)
}

const patchPackageBin = require.resolve("patch-package/index.js")
execSync(`"${process.execPath}" "${patchPackageBin}"`, { stdio: "inherit" })
