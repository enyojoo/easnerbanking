import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/** @type {import("eslint").Linter.Config[]} */
const nextConfig = require("eslint-config-next/core-web-vitals")

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    rules: {
      // Next 16 / react-hooks v7: too strict for existing data-loading patterns; keep hooks deps as warnings.
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]

export default config
