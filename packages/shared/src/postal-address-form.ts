import {
  AddressValidationError,
  formatAddress,
  getCountryData,
  getCountryFields,
  getCountrySubdivisions,
  getRequiredFields,
  getZipExamples,
  isAddressError,
  isAddressValid,
  isValidCountrySubdivisionCode,
  validateAddress,
} from "./lib-address/runtime"
import type { CountryCode } from "./lib-address/runtime"
import {
  ensureOperationalAddressCountryRegistered,
  isOperationalAddressCountryRegistered,
  registerOperationalAddressCountries,
} from "./lib-address/country-registration"
import { postalLabelFromType, subdivisionLabelFromType } from "./lib-address/field-labels"

export type OperationalAddressParts = {
  line1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  countryCode?: string | null
}

export type OperationalAddressField = "line1" | "city" | "state" | "postalCode" | "country"

export type OperationalAddressFormFieldConfig = {
  visible: boolean
  required: boolean
  label: string
}

export type OperationalAddressFormConfig = {
  countryCode: string
  line1: OperationalAddressFormFieldConfig
  city: OperationalAddressFormFieldConfig
  subdivision: OperationalAddressFormFieldConfig & {
    mode: "dropdown" | "text" | "hidden"
  }
  postal: OperationalAddressFormFieldConfig & {
    examples: string[]
  }
}

export type OperationalAddressValidationResult = {
  valid: boolean
  errors: Partial<Record<OperationalAddressField, string>>
}

export {
  ensureOperationalAddressCountryRegistered,
  isOperationalAddressCountryRegistered,
  registerOperationalAddressCountries,
}

const LIB_TO_EASNER_FIELD: Record<string, OperationalAddressField> = {
  addressLine1: "line1",
  city: "city",
  state: "state",
  zip: "postalCode",
}

function normalizeCountryCode(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
}

function fieldVisible(flag: "required" | "optional" | undefined): boolean {
  return flag === "required" || flag === "optional"
}

/** Prefer Latin/English display labels where metadata provides them (e.g. UAE emirates). */
const LIB_ADDRESS_ENGLISH_DISPLAY = { useLatin: true } as const

export function toLibAddressInput(parts: OperationalAddressParts): {
  country: CountryCode
  addressLine1?: string
  city?: string
  state?: string
  zip?: string
} {
  const country = normalizeCountryCode(parts.countryCode) as CountryCode
  return {
    country,
    addressLine1: String(parts.line1 ?? "").trim() || undefined,
    city: String(parts.city ?? "").trim() || undefined,
    state: String(parts.state ?? "").trim() || undefined,
    zip: String(parts.postalCode ?? "").trim() || undefined,
  }
}

export function listSubdivisions(countryCode: string): { value: string; label: string }[] {
  const code = normalizeCountryCode(countryCode) as CountryCode
  if (!isOperationalAddressCountryRegistered(code)) return []
  return getCountrySubdivisions(code, LIB_ADDRESS_ENGLISH_DISPLAY)
}

export function getOperationalAddressFormConfig(countryCode: string): OperationalAddressFormConfig {
  const code = normalizeCountryCode(countryCode)
  if (!/^[A-Z]{2}$/.test(code)) {
    return emptyOperationalAddressFormConfig(code)
  }
  if (!isOperationalAddressCountryRegistered(code)) {
    return emptyOperationalAddressFormConfig(code)
  }

  const fields = getCountryFields(code as CountryCode)
  const countryData = getCountryData(code as CountryCode)
  const subdivisions = getCountrySubdivisions(code as CountryCode)
  const subdivisionVisible = fieldVisible(fields.state)
  const subdivisionMode: OperationalAddressFormConfig["subdivision"]["mode"] = !subdivisionVisible
    ? "hidden"
    : subdivisions.length > 0
      ? "dropdown"
      : "text"

  return {
    countryCode: code,
    line1: {
      visible: true,
      required: fields.addressLine1 === "required",
      label: "Street address",
    },
    city: {
      visible: fieldVisible(fields.city),
      required: fields.city === "required",
      label: "City",
    },
    subdivision: {
      visible: subdivisionVisible,
      required: fields.state === "required",
      label: subdivisionLabelFromType(countryData.state_name_type),
      mode: subdivisionMode,
    },
    postal: {
      visible: fieldVisible(fields.zip),
      required: fields.zip === "required",
      label: postalLabelFromType(countryData.zip_name_type),
      examples: getZipExamples(code as CountryCode),
    },
  }
}

function emptyOperationalAddressFormConfig(countryCode: string): OperationalAddressFormConfig {
  return {
    countryCode,
    line1: { visible: true, required: true, label: "Street address" },
    city: { visible: true, required: true, label: "City" },
    subdivision: { visible: true, required: false, label: "State / Province", mode: "text" },
    postal: { visible: true, required: true, label: "Postal code", examples: [] },
  }
}

function mapLibAddressError(err: unknown): Partial<Record<OperationalAddressField, string>> {
  if (!isAddressError(err)) return {}

  const libErr = err
  const errors: Partial<Record<OperationalAddressField, string>> = {}
  const add = (field: OperationalAddressField, message: string) => {
    if (!errors[field]) errors[field] = message
  }

  if (libErr instanceof AddressValidationError) {
    for (const child of libErr.errors) {
      Object.assign(errors, mapLibAddressError(child))
    }
    return errors
  }

  const code = libErr.code
  if (code === "MISSING_FIELD" && "field" in libErr) {
    const mapped = LIB_TO_EASNER_FIELD[String((libErr as { field: string }).field)]
    if (mapped) add(mapped, "This field is required")
    return errors
  }
  if (code === "INVALID_STATE") {
    add("state", "Select a valid state or province")
    return errors
  }
  if (code === "INVALID_ZIP" || code === "INVALID_ZIP_SUB_REGION") {
    add("postalCode", "Enter a valid postal code")
    return errors
  }
  if (code === "COUNTRY_MISSING") {
    add("country", "Country is not supported")
  }
  return errors
}

export function validateOperationalAddress(
  countryCode: string,
  parts: OperationalAddressParts,
): OperationalAddressValidationResult {
  const code = normalizeCountryCode(countryCode || parts.countryCode)
  if (!/^[A-Z]{2}$/.test(code)) {
    return { valid: false, errors: { country: "Select a country" } }
  }
  if (!isOperationalAddressCountryRegistered(code)) {
    return { valid: false, errors: { country: "Country is not supported" } }
  }

  const input = toLibAddressInput({ ...parts, countryCode: code })
  try {
    validateAddress(input)
    return { valid: true, errors: {} }
  } catch (err) {
    return { valid: false, errors: mapLibAddressError(err) }
  }
}

export type RecipientHolderAddressFieldErrors = {
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
}

export function recipientHolderAddressFieldErrors(
  result: OperationalAddressValidationResult,
): RecipientHolderAddressFieldErrors {
  const out: RecipientHolderAddressFieldErrors = {}
  if (result.errors.line1) out.addressLine1 = result.errors.line1
  if (result.errors.city) out.city = result.errors.city
  if (result.errors.state) out.state = result.errors.state
  if (result.errors.postalCode) out.postalCode = result.errors.postalCode
  return out
}

/**
 * Holder-address check for recipient forms. When country JSON is not loaded
 * (Metro fallback), require the visible fallback fields instead of failing
 * the whole country.
 */
export function validateRecipientHolderAddress(
  countryCode: string,
  parts: OperationalAddressParts,
): OperationalAddressValidationResult {
  const code = normalizeCountryCode(countryCode || parts.countryCode)
  if (!/^[A-Z]{2}$/.test(code)) {
    return { valid: false, errors: { country: "Select a country" } }
  }
  if (isOperationalAddressCountryRegistered(code)) {
    return validateOperationalAddress(code, parts)
  }

  const config = getOperationalAddressFormConfig(code)
  const errors: Partial<Record<OperationalAddressField, string>> = {}
  const missing = (field: OperationalAddressField) => {
    errors[field] = "This field is required"
  }
  if (config.line1.required && !String(parts.line1 ?? "").trim()) missing("line1")
  if (config.city.visible && config.city.required && !String(parts.city ?? "").trim()) missing("city")
  if (config.subdivision.visible && config.subdivision.required && !String(parts.state ?? "").trim()) {
    missing("state")
  }
  if (config.postal.visible && config.postal.required && !String(parts.postalCode ?? "").trim()) {
    missing("postalCode")
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

export function isOperationalAddressComplete(
  countryCode: string,
  parts: OperationalAddressParts,
): boolean {
  const code = normalizeCountryCode(countryCode || parts.countryCode)
  if (!/^[A-Z]{2}$/.test(code)) return false
  if (!isOperationalAddressCountryRegistered(code)) return false

  const required = getRequiredFields(code as CountryCode)
  const input = toLibAddressInput({ ...parts, countryCode: code })
  for (const field of required) {
    const value = input[field as keyof typeof input]
    if (!String(value ?? "").trim()) return false
  }
  try {
    return isAddressValid(input)
  } catch {
    return false
  }
}

export function getOperationalAddressMissingLabels(
  countryCode: string,
  parts: OperationalAddressParts,
): string[] {
  const config = getOperationalAddressFormConfig(countryCode)
  const missing: string[] = []
  const check = (field: OperationalAddressField, label: string, required: boolean) => {
    if (!required) return
    const value =
      field === "line1"
        ? parts.line1
        : field === "city"
          ? parts.city
          : field === "state"
            ? parts.state
            : field === "postalCode"
              ? parts.postalCode
              : parts.countryCode
    if (!String(value ?? "").trim()) missing.push(label.toLowerCase())
  }

  check("line1", config.line1.label, config.line1.required)
  check("city", config.city.label, config.city.required)
  check("state", config.subdivision.label, config.subdivision.required)
  check("postalCode", config.postal.label, config.postal.required)
  return missing
}

export function sanitizeSubdivisionForCountry(countryCode: string, subdivision: string | null | undefined): string {
  const code = normalizeCountryCode(countryCode)
  const value = String(subdivision ?? "").trim()
  if (!value || !/^[A-Z]{2}$/.test(code)) return ""
  if (!isOperationalAddressCountryRegistered(code)) return value

  const fields = getCountryFields(code as CountryCode)
  if (!fieldVisible(fields.state)) return ""

  const subdivisions = getCountrySubdivisions(code as CountryCode, LIB_ADDRESS_ENGLISH_DISPLAY)
  if (subdivisions.length === 0) return value
  const upper = value.toUpperCase()
  if (subdivisions.some((row: { value: string; label: string }) => row.value === upper)) return upper
  const lower = value.toLowerCase()
  const byLabel = subdivisions.find((row: { value: string; label: string }) => row.label.toLowerCase() === lower)
  if (byLabel) return byLabel.value
  if (isValidCountrySubdivisionCode(code as CountryCode, value)) return value
  return ""
}

export type FormatOperationalAddressOptions = {
  appendCountry?: boolean
  preserveCase?: boolean
}

function titleCaseAddressWord(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

const ADDRESS_DISPLAY_TOKEN = /^([^\w]*)([\w'.-]+)([^\w]*)$/

/** Title-case street/city/subdivision labels; keep 2-letter codes (CA, NY). */
function titleCaseAddressDisplayToken(word: string): string {
  const match = word.match(ADDRESS_DISPLAY_TOKEN)
  if (!match) return word
  const [, lead, core, trail] = match
  if (/^[A-Z]{2}$/.test(core)) return `${lead}${core}${trail}`
  if (core !== core.toUpperCase() && core !== core.toLowerCase()) {
    return `${lead}${core}${trail}`
  }
  return `${lead}${titleCaseAddressWord(core)}${trail}`
}

/** Normalize ALL CAPS address fragments for customer-facing display (invoices, PDFs). */
export function formatAddressDisplayPart(input: string | null | undefined): string {
  const raw = String(input ?? "").trim()
  if (!raw) return ""
  return raw
    .split(",")
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .map((word) => titleCaseAddressDisplayToken(word))
        .join(" "),
    )
    .join(", ")
}

function resolveSubdivisionForFormatting(
  countryCode: CountryCode,
  subdivision: string | null | undefined,
): string {
  const value = String(subdivision ?? "").trim()
  if (!value) return ""
  if (!isOperationalAddressCountryRegistered(countryCode)) {
    return formatAddressDisplayPart(value)
  }

  const upper = value.toUpperCase()
  const subdivisions = getCountrySubdivisions(countryCode, LIB_ADDRESS_ENGLISH_DISPLAY)
  const byCode = subdivisions.find((row: { value: string; label: string }) => row.value === upper)
  if (byCode) return byCode.value

  const byLabel = subdivisions.find(
    (row: { value: string; label: string }) => row.label.toLowerCase() === value.toLowerCase(),
  )
  if (byLabel) return byLabel.value

  if (isValidCountrySubdivisionCode(countryCode, value)) return value
  return formatAddressDisplayPart(value)
}

function normalizeOperationalAddressParts(
  parts: OperationalAddressParts,
  opts?: FormatOperationalAddressOptions,
): OperationalAddressParts {
  if (opts?.preserveCase) return parts

  const countryCode = normalizeCountryCode(parts.countryCode)
  const line1 = formatAddressDisplayPart(parts.line1)
  const city = formatAddressDisplayPart(parts.city)
  const postalCode = String(parts.postalCode ?? "").trim()
  let state = String(parts.state ?? "").trim()

  if (/^[A-Z]{2}$/.test(countryCode) && isOperationalAddressCountryRegistered(countryCode)) {
    state = resolveSubdivisionForFormatting(countryCode as CountryCode, state)
  } else if (state) {
    state = formatAddressDisplayPart(state)
  }

  return {
    ...parts,
    countryCode,
    line1,
    city,
    state,
    postalCode,
  }
}

function formatOperationalAddressFallback(
  parts: OperationalAddressParts,
  opts?: FormatOperationalAddressOptions,
): string {
  const normalized = normalizeOperationalAddressParts(parts, opts)
  const line1 = String(normalized.line1 ?? "").trim()
  const city = String(normalized.city ?? "").trim()
  const state = String(normalized.state ?? "").trim()
  const postal = String(normalized.postalCode ?? "").trim()
  const lines: string[] = []
  if (line1) lines.push(line1)
  const locality = [city, state].filter(Boolean).join(", ")
  const localityPostal = [locality, postal].filter(Boolean).join(" ")
  if (localityPostal) lines.push(localityPostal)
  return lines.join("\n")
}

export function formatOperationalAddress(
  parts: OperationalAddressParts,
  opts?: FormatOperationalAddressOptions,
): string {
  const normalized = normalizeOperationalAddressParts(parts, opts)
  const code = normalizeCountryCode(normalized.countryCode)
  if (!/^[A-Z]{2}$/.test(code) || !isOperationalAddressCountryRegistered(code)) {
    return formatOperationalAddressFallback(normalized, opts)
  }

  const userPreserveCase = opts?.preserveCase ?? false
  if (!userPreserveCase) {
    const lines = formatOperationalAddressFallback(normalized, opts)
    if (!lines.trim()) return ""
    if (opts?.appendCountry) {
      const countryData = getCountryData(code as CountryCode)
      const countryName = formatAddressDisplayPart(String(countryData?.name ?? ""))
      if (countryName) return [lines, countryName].filter(Boolean).join("\n")
    }
    return lines
  }

  try {
    return formatAddress(toLibAddressInput(normalized), {
      appendCountry: opts?.appendCountry ?? false,
      preserveCase: true,
      ...LIB_ADDRESS_ENGLISH_DISPLAY,
    })
  } catch {
    // lib-address throws on incomplete/invalid required fields (e.g. US with country only).
    const fallback = formatOperationalAddressFallback(normalized, opts)
    if (opts?.appendCountry) {
      const countryData = getCountryData(code as CountryCode)
      const countryName = String(countryData?.name ?? "").trim()
      if (countryName) {
        return [fallback, formatAddressDisplayPart(countryName)].filter(Boolean).join("\n")
      }
    }
    return fallback
  }
}

export function formatOperationalAddressLines(
  parts: OperationalAddressParts,
  opts?: FormatOperationalAddressOptions,
): string[] {
  const formatted = formatOperationalAddress(parts, opts)
  return formatted
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}
