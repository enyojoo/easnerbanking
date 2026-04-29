#!/usr/bin/env node
/**
 * Fail if legacy panel hex literals appear under mobile/src/screens.
 * Prefer colors.frame.* and colors.brand.slate from theme.
 *
 * Usage: node scripts/check-mobile-theme-literals.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', 'src', 'screens')

const BAD = ['#F9F9F9', '#E2E2E2', '#6F756F']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}

const bad = []
for (const file of walk(root)) {
  const src = readFileSync(file, 'utf8')
  for (const h of BAD) {
    if (src.includes(h)) bad.push({ file, hex: h })
  }
}

if (bad.length) {
  console.error('Legacy hex literals reintroduced in screens:\n')
  for (const b of bad) console.error(`  ${b.file} → ${b.hex}`)
  process.exit(1)
}
console.log('check-mobile-theme-literals: ok')
