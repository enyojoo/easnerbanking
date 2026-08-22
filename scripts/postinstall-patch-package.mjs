#!/usr/bin/env node
/**
 * Apply patch-package only when patched dependencies are installed.
 * Office-only Vercel installs omit business/Solana deps (e.g. bigint-buffer).
 */
import { execSync } from "node:child_process"
import { createRequire } from "node:module"
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"

const require = createRequire(import.meta.url)
import { join } from "node:path"

const rootDir = process.cwd()
const patchesDir = join(rootDir, "patches")
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

function packageInstallRoots(pkg) {
  return [join(rootDir, "node_modules", pkg), join(rootDir, "mobile", "node_modules", pkg)]
    .filter((dir) => existsSync(dir))
    .map((dir) => {
      if (dir.startsWith(join(rootDir, "mobile", "node_modules"))) return join(rootDir, "mobile")
      return rootDir
    })
}

const patchFiles = readdirSync(patchesDir).filter((f) => f.endsWith(".patch"))
const applicable = patchFiles.filter((file) => {
  const pkg = packageNameFromPatchFile(file)
  if (!pkg) return false
  return packageInstallRoots(pkg).length > 0
})

if (applicable.length === 0) {
  if (patchFiles.length > 0) {
    console.log("patch-package: skipped (no patched packages in this install)")
  }
  process.exit(0)
}

const packageNames = [
  ...new Set(
    applicable.map((file) => packageNameFromPatchFile(file)).filter(Boolean),
  ),
]

const patchPackageBin = require.resolve("patch-package/index.js")
const tempPatchDirName = ".patch-package-staging"

const byCwd = new Map()
for (const file of applicable) {
  const pkg = packageNameFromPatchFile(file)
  if (!pkg) continue
  for (const cwd of new Set(packageInstallRoots(pkg))) {
    const list = byCwd.get(cwd) || []
    list.push(file)
    byCwd.set(cwd, list)
  }
}

console.log(`patch-package: applying ${packageNames.join(", ")}`)
for (const [cwd, files] of byCwd) {
  const tempPatchDir = join(cwd, tempPatchDirName)
  rmSync(tempPatchDir, { recursive: true, force: true })
  mkdirSync(tempPatchDir, { recursive: true })
  try {
    for (const file of files) {
      copyFileSync(join(patchesDir, file), join(tempPatchDir, file))
    }
    execSync(
      `"${process.execPath}" "${patchPackageBin}" --patch-dir "${tempPatchDirName}"`,
      { stdio: "inherit", cwd },
    )
  } finally {
    rmSync(tempPatchDir, { recursive: true, force: true })
  }
}
