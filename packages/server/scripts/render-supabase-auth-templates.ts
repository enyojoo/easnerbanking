#!/usr/bin/env npx tsx
/**
 * Regenerate Supabase Auth HTML templates from the shared email design system.
 *
 * Usage: npx tsx packages/server/scripts/render-supabase-auth-templates.ts
 *
 * Paste the generated files into Supabase Dashboard → Authentication → Email Templates:
 * - password-reset.html → "Reset password" (or "Recovery")
 * - signup-verify.html → "Confirm signup" (or "Magic link" if using OTP for signup)
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { generateSupabaseAuthEmailHtml } from "../lib/email-generator"

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase-auth-templates",
)

const files: { name: string; variant: "password_reset" | "signup_verify" }[] = [
  { name: "password-reset.html", variant: "password_reset" },
  { name: "signup-verify.html", variant: "signup_verify" },
]

fs.mkdirSync(outDir, { recursive: true })

for (const { name, variant } of files) {
  const html = generateSupabaseAuthEmailHtml(variant)
  const filePath = path.join(outDir, name)
  fs.writeFileSync(filePath, html.trim() + "\n", "utf8")
  console.log(`Wrote ${filePath}`)
}

console.log("\nNext: Supabase Dashboard → Authentication → Email Templates → paste HTML per file.")
