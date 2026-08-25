/**
 * Build guard: the workspace shell routes MUST stay statically prerendered.
 *
 * The instant-navigation UX depends on it — a dynamic shell (e.g. someone
 * adds `headers()`/`cookies()` to a layout) disables router prefetch for the
 * whole app and every sidebar click goes back to blocking on a server round
 * trip. Runs as `postbuild`, so `next build` fails loudly instead of shipping
 * the regression. Context: docs/speed-ux-plan.md (Phase B1).
 */
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const REQUIRED_STATIC_SHELLS = [
  "/accounts",
  "/cards",
  "/dashboard",
  "/invoices",
  "/links",
  "/payroll",
  "/send",
  "/settings",
  "/transactions",
]

const manifestPath = resolve(__dirname, "../.next/prerender-manifest.json")

let manifest
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"))
} catch (error) {
  console.error(`[assert-static-shells] Could not read ${manifestPath}: ${error.message}`)
  process.exit(1)
}

const staticRoutes = new Set(Object.keys(manifest.routes ?? {}))
const missing = REQUIRED_STATIC_SHELLS.filter((route) => !staticRoutes.has(route))

if (missing.length > 0) {
  console.error(
    "[assert-static-shells] FAILED — these workspace shell routes are no longer statically prerendered:\n" +
      missing.map((r) => `  - ${r}`).join("\n") +
      "\n\nMost likely cause: a dynamic API (headers(), cookies(), unawaited searchParams in a server\n" +
      "component) was introduced in the root layout or one of these routes' server trees.\n" +
      "This breaks router prefetching app-wide. See docs/speed-ux-plan.md (Phase B1).",
  )
  process.exit(1)
}

console.log(`[assert-static-shells] OK — ${REQUIRED_STATIC_SHELLS.length} workspace shells statically prerendered.`)
