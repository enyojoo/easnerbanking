#!/usr/bin/env node
/**
 * Run Expo CLI from the hoisted workspace install (npm workspaces often omit .bin/expo).
 */
const path = require("path")

const candidates = [
  path.join(__dirname, "..", "node_modules", "expo", "bin", "cli"),
  path.join(__dirname, "..", "..", "node_modules", "expo", "bin", "cli"),
]

for (const cli of candidates) {
  try {
    require(cli)
    return
  } catch {
    /* try next */
  }
}

console.error(
  "[expo-cli] Could not find expo. From the repo root run: npm install",
)
process.exit(1)
