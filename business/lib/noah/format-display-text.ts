/**
 * Title-case Noah fiat VA display fields on write (names, bank names, addresses).
 * Bank names keep short all-caps tokens as abbreviations (e.g. SSB, HSBC).
 */
import { titleCaseAddressPart, titleCaseName } from "./parse-noah-customer-for-users"

function titleCaseWord(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** All-caps tokens in bank names that are words, not abbreviations. */
const BANK_NAME_NOT_ABBREV = new Set([
  "AND",
  "AG",
  "BANK",
  "BANKING",
  "CO",
  "COMPANY",
  "CREDIT",
  "FINANCIAL",
  "FOR",
  "GMBH",
  "GROUP",
  "HOLDINGS",
  "INC",
  "INTERNATIONAL",
  "LIMITED",
  "LLC",
  "LTD",
  "NA",
  "NATIONAL",
  "OF",
  "PLC",
  "SA",
  "SAVINGS",
  "SERVICES",
  "THE",
  "TRUST",
  "UNION",
])

const BANK_NAME_WORD = /^([^\w]*)([\w'.&-]+)([^\w]*)$/

function isBankAbbreviation(core: string): boolean {
  if (!/^[A-Za-z.&-]+$/.test(core)) return false
  const upper = core.toUpperCase()
  if (core !== upper) return false
  const len = upper.replace(/[.&-]/g, "").length
  if (len < 2 || len > 4) return false
  if (BANK_NAME_NOT_ABBREV.has(upper)) return false
  return true
}

/**
 * Title-case bank names; preserve short all-caps abbreviations (SSB, HSBC).
 * e.g. "SSB BANK" → "SSB Bank", "SSB Bank" unchanged.
 */
export function titleCaseBankName(input: string | null | undefined): string {
  const raw = String(input ?? "").trim()
  if (!raw) return ""
  return raw
    .split(/\s+/)
    .map((word) => {
      const m = word.match(BANK_NAME_WORD)
      if (!m) return word
      const [, lead, core, trail] = m
      if (isBankAbbreviation(core)) return `${lead}${core.toUpperCase()}${trail}`
      if (core !== core.toUpperCase() && core !== core.toLowerCase()) {
        return `${lead}${core}${trail}`
      }
      return `${lead}${titleCaseWord(core)}${trail}`
    })
    .join(" ")
}

export function formatVaAccountHolderName(input: string | null | undefined): string | null {
  const s = titleCaseName(input)
  return s || null
}

export function formatVaBankName(input: string | null | undefined): string | null {
  const s = titleCaseBankName(input)
  return s || null
}

export function formatVaBankAddress(input: string | null | undefined): string | null {
  const s = titleCaseAddressPart(input)
  return s || null
}
