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
  return getCountrySubdivisions(code)
}

export function getOperationalAddressFormConfig(countryCode: string): OperationalAddressFormConfig {
  const code = normalizeCountryCode(countryCode)
  if (!/^[A-Z]{2}$/.test(code)) {
    return emptyOperationalAddressFormConfig(code)
  }
  if (!isOperationalAddressCountryRegistered(code)) {
    throw new Error(`Country ${code} is not registered with lib-address`)
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

  const errors: Partial<Record<OperationalAddressField, string>> = {}
  const add = (field: OperationalAddressField, message: string) => {
    if (!errors[field]) errors[field] = message
  }

  if (err instanceof AddressValidationError) {
    for (const child of err.errors) {
      Object.assign(errors, mapLibAddressError(child))
    }
    return errors
  }

  const code = err.code
  if (code === "MISSING_FIELD" && "field" in err) {
    const mapped = LIB_TO_EASNER_FIELD[String((err as { field: string }).field)]
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
  return isAddressValid(input)
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

  const subdivisions = getCountrySubdivisions(code as CountryCode)
  if (subdivisions.length === 0) return value
  if (subdivisions.some((row) => row.value === value)) return value
  if (isValidCountrySubdivisionCode(code as CountryCode, value)) return value
  return ""
}

export type FormatOperationalAddressOptions = {
  appendCountry?: boolean
  preserveCase?: boolean
}

export function formatOperationalAddress(
  parts: OperationalAddressParts,
  opts?: FormatOperationalAddressOptions,
): string {
  const code = normalizeCountryCode(parts.countryCode)
  if (!/^[A-Z]{2}$/.test(code) || !isOperationalAddressCountryRegistered(code)) {
    const line1 = String(parts.line1 ?? "").trim()
    const city = String(parts.city ?? "").trim()
    const state = String(parts.state ?? "").trim()
    const postal = String(parts.postalCode ?? "").trim()
    const lines: string[] = []
    if (line1) lines.push(line1)
    const locality = [city, state].filter(Boolean).join(", ")
    const localityPostal = [locality, postal].filter(Boolean).join(" ")
    if (localityPostal) lines.push(localityPostal)
    return lines.join("\n")
  }

  return formatAddress(toLibAddressInput(parts), {
    appendCountry: opts?.appendCountry ?? false,
    preserveCase: opts?.preserveCase ?? false,
  })
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
