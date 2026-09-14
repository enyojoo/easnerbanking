#!/usr/bin/env node
/** @deprecated Use verify-email-env.mjs */
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const next = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-email-env.mjs")
const result = spawnSync(process.execPath, [next], { stdio: "inherit" })
process.exit(result.status ?? 1)
