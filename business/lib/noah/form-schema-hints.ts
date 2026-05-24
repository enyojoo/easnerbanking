import { createHash } from "crypto"
import type { ChannelItem } from "./payout-prepare"

/** Normalized hints for recipient UI and send amount screen (from Noah FormSchema). */
export type PayoutFieldsSchemaHint = {
  channel_id?: string
  payment_method_type?: string
  form_schema_hash?: string
  /** Free-text note maps to Noah Reference (US optional, EUR required). */
  reference_required?: boolean
  reference_optional?: boolean
  /** Canada and similar: show purpose dropdown instead of Note. */
  payment_purpose_enum?: string[]
  /** NG / KE / GH / ZA bank: searchable bank list. */
  bank_enum?: string[]
  /** Mobile money: UI labels from Noah Identifier sell channels for this country. */
  mobile_provider_labels?: string[]
  needs_phone?: boolean
  needs_email?: boolean
  needs_address?: boolean
  needs_branch_code?: boolean
  needs_sort_code?: boolean
  limits?: { min?: string; max?: string }
  processing_seconds?: number
  /** Drives amount-screen control. */
  amount_field_mode: "note" | "payment_purpose" | "note_optional_only"
}

function schemaHash(schema: Record<string, unknown> | undefined): string | undefined {
  if (!schema) return undefined
  return createHash("sha256").update(JSON.stringify(schema)).digest("hex").slice(0, 16)
}

function stringEnum(node: Record<string, unknown> | undefined): string[] | undefined {
  if (!node) return undefined
  const en = node.enum
  if (!Array.isArray(en)) return undefined
  const vals = en.map((v) => String(v)).filter(Boolean)
  return vals.length > 0 ? vals : undefined
}

function isRequired(schema: Record<string, unknown> | undefined, key: string): boolean {
  const req = schema?.required
  return Array.isArray(req) && req.includes(key)
}

/** Root `properties` or legacy flat shape. */
function rootProperties(schema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schema) return undefined
  const top = schema.properties
  if (top && typeof top === "object") return top as Record<string, unknown>
  return schema
}

/** Field on FormSchema root or under `BankDetails.properties`. */
function formFieldNode(
  schema: Record<string, unknown> | undefined,
  fieldName: string,
): Record<string, unknown> | undefined {
  const root = rootProperties(schema)
  if (!root) return undefined
  const direct = root[fieldName]
  if (direct && typeof direct === "object") return direct as Record<string, unknown>
  const bankDetails = root.BankDetails
  if (!bankDetails || typeof bankDetails !== "object") return undefined
  const bd = bankDetails as Record<string, unknown>
  const nested = bd.properties
  if (!nested || typeof nested !== "object") return undefined
  const node = (nested as Record<string, unknown>)[fieldName]
  return node && typeof node === "object" ? (node as Record<string, unknown>) : undefined
}

/** BankDetails.Bank enum (NG/KE/GH/ZA BankLocal). */
export function bankEnumFromFormSchema(
  schema: Record<string, unknown> | undefined,
): string[] | undefined {
  return stringEnum(formFieldNode(schema, "Bank"))
}

function identifierChannels(items: ChannelItem[]): ChannelItem[] {
  return items.filter((c) => String(c.PaymentMethodCategory ?? "").toLowerCase() === "identifier")
}

/** User-facing label for a Noah Identifier sell channel. */
export function labelForIdentifierChannel(
  channel: Pick<ChannelItem, "PaymentMethodType">,
  countryCode: string,
): string {
  const t = String(channel.PaymentMethodType ?? "").toLowerCase()
  const cc = countryCode.toUpperCase()
  if (t.includes("airtel")) return "Airtel Money"
  if (t.includes("mpesa") || t.includes("momo")) return "M-PESA"
  if (t.includes("mtn")) return "MTN"
  if (t.includes("orange")) return "Orange Money"
  if (t.includes("wave")) return "Wave"
  if (cc === "KE") return "M-PESA"
  return "Mobile Money"
}

/** Substrings for findIdentifierSellChannel when preparing a sell. */
export function mobileProviderPrepareSubstrings(label: string | null | undefined): string[] | undefined {
  const p = String(label || "").toLowerCase()
  if (!p) return undefined
  if (p.includes("airtel")) return ["airtel"]
  if (p.includes("mpesa") || p.includes("m-pesa")) return ["mpesa", "momo"]
  if (p.includes("mtn")) return ["mtn", "momo"]
  if (p.includes("orange")) return ["orange"]
  if (p.includes("wave")) return ["wave"]
  return [p.replace(/\s+/g, "")]
}

/** All Identifier mobile providers Noah exposes for a country/fiat pair. */
export function mobileProviderLabelsFromSellItems(
  items: ChannelItem[],
  countryCode: string,
): string[] {
  const cc = countryCode.toUpperCase()
  const labels = identifierChannels(items).map((c) => labelForIdentifierChannel(c, cc))
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b))
}

/**
 * Derive UI/prepare hints from a Noah sell channel FormSchema.
 */
export function normalizeFormSchemaHints(
  channel: Pick<ChannelItem, "ID" | "PaymentMethodType" | "FormSchema" | "Limits" | "ProcessingSeconds">,
): PayoutFieldsSchemaHint {
  const schema = channel.FormSchema
  const bankEnum = bankEnumFromFormSchema(schema)
  const purposeEnum = stringEnum(formFieldNode(schema, "PaymentPurpose"))
  const pmt = String(channel.PaymentMethodType ?? "")
  const pmtLow = pmt.toLowerCase()

  const country = String(channel.Country ?? "").toUpperCase()
  const fiat = String(channel.FiatCurrency ?? "").toUpperCase()
  const referenceInSchema = formFieldNode(schema, "Reference") != null
  const referenceRequiredOnSchema = isRequired(schema, "Reference")
  /** Noah US ACH/Fedwire: Reference is optional on prepare; amount screen uses optional Note. */
  const usBankOptionalReference =
    country === "US" &&
    (fiat === "USD" || !fiat) &&
    (pmtLow.includes("ach") || pmtLow.includes("fedwire"))
  const referenceRequired = referenceRequiredOnSchema && !usBankOptionalReference
  const referenceOptional =
    (referenceInSchema && !referenceRequired) || usBankOptionalReference

  let amount_field_mode: PayoutFieldsSchemaHint["amount_field_mode"] = "note_optional_only"
  if (usBankOptionalReference) {
    amount_field_mode = "note_optional_only"
  } else if (purposeEnum && purposeEnum.length > 0 && country === "CA") {
    amount_field_mode = "payment_purpose"
  } else if (referenceRequired) {
    amount_field_mode = "note"
  } else if (referenceOptional || pmtLow.includes("ach") || pmtLow.includes("fedwire")) {
    amount_field_mode = "note_optional_only"
  }

  const limitsRaw = channel.Limits as { MinLimit?: string; MaxLimit?: string } | undefined

  return {
    channel_id: channel.ID ? String(channel.ID) : undefined,
    payment_method_type: pmt || undefined,
    form_schema_hash: schemaHash(schema),
    reference_required: referenceRequired,
    reference_optional: referenceOptional,
    payment_purpose_enum: purposeEnum,
    bank_enum: bankEnum,
    mobile_provider_labels: undefined,
    needs_phone: isRequired(schema, "PhoneNumber"),
    needs_email: isRequired(schema, "Email"),
    needs_address:
      isRequired(schema, "AccountHolderAddress") ||
      (country === "CA" && formFieldNode(schema, "AccountHolderAddress") != null),
    needs_branch_code: formFieldNode(schema, "BranchCode") != null,
    needs_sort_code: formFieldNode(schema, "SortCode") != null,
    limits:
      limitsRaw?.MinLimit || limitsRaw?.MaxLimit
        ? { min: limitsRaw.MinLimit, max: limitsRaw.MaxLimit }
        : undefined,
    processing_seconds:
      typeof channel.ProcessingSeconds === "number" ? channel.ProcessingSeconds : undefined,
    amount_field_mode,
  }
}

/** Pick default bank or identifier channel for a rail from sell items. */
export function pickChannelForRail(
  items: ChannelItem[],
  rail: "bank_transfer" | "mobile_money",
): ChannelItem | null {
  if (rail === "mobile_money") {
    return (
      items.find((c) => String(c.PaymentMethodCategory ?? "").toLowerCase() === "identifier") ??
      null
    )
  }
  const banks = items.filter((c) => String(c.PaymentMethodCategory ?? "") === "Bank")
  if (banks.length === 0) return null
  const fiat = String(banks[0]?.FiatCurrency ?? "").toUpperCase()
  if (fiat === "EUR") {
    const sepa = banks.find((c) => String(c.PaymentMethodType ?? "").toLowerCase().includes("sepa"))
    return sepa ?? banks[0]!
  }
  if (fiat === "USD") {
    const ach = banks.find((c) => String(c.PaymentMethodType ?? "").toLowerCase().includes("ach"))
    return ach ?? banks[0]!
  }
  const bankLocal = banks.find((c) => String(c.PaymentMethodType ?? "").toLowerCase().includes("banklocal"))
  return bankLocal ?? banks[0]!
}
