import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const libAddressRoot = path.resolve(rootDir, "../../node_modules/lib-address")

export default defineConfig({
  resolve: {
    conditions: ["browser", "import", "module", "default"],
    alias: [
      {
        find: /^lib-address\/countries\/(.*)\.json$/,
        replacement: `${libAddressRoot}/countries/$1.json`,
      },
      {
        find: "lib-address",
        replacement: path.resolve(libAddressRoot, "dist/entry-browser.mjs"),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
})
