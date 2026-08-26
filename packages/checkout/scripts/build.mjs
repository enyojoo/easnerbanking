import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const outfile = join(root, "../dist/checkout.js")

await mkdir(join(root, "../dist"), { recursive: true })

await build({
  absWorkingDir: join(root, ".."),
  entryPoints: ["src/index.ts"],
  outfile,
  bundle: true,
  format: "iife",
  globalName: "EasnerCheckout",
  platform: "browser",
  target: ["es2019"],
  minify: true,
  legalComments: "none",
})

console.log(`wrote ${outfile}`)
