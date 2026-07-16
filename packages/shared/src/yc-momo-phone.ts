/** ISO-2 → ITU calling code (YC MoMo pay-in corridors). */
const YC_MOMO_CALLING_CODE: Record<string, string> = {
  AR: "54",
  BR: "55",
  CL: "56",
  CO: "57",
  GH: "233",
  KE: "254",
  MX: "52",
  NG: "234",
  RW: "250",
  TZ: "255",
  UG: "256",
  ZA: "27",
}

export function resolveYcMomoCallingCode(countryCode: string): string | null {
  const cc = String(countryCode ?? "").trim().toUpperCase()
  return YC_MOMO_CALLING_CODE[cc] ?? null
}

export function resolveYcMomoCallingCodeLabel(countryCode: string): string | null {
  const code = resolveYcMomoCallingCode(countryCode)
  return code ? `+${code}` : null
}

/** Normalize MoMo phone to E.164 (+country + national digits) for YC receive. */
export function normalizeYcMomoPhone(phone: string, countryCode: string): string {
  const trimmed = String(phone ?? "").trim()
  if (!trimmed) return ""

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "")
    return digits ? `+${digits}` : ""
  }

  let digits = trimmed.replace(/[\s().-]/g, "").replace(/\D/g, "")
  if (!digits) return ""

  if (digits.startsWith("00")) {
    digits = digits.slice(2)
    return digits ? `+${digits}` : ""
  }

  const calling = resolveYcMomoCallingCode(countryCode)
  if (!calling) {
    return `+${digits}`
  }

  if (digits.startsWith(calling) && digits.length > calling.length) {
    return `+${digits}`
  }
  if (digits.startsWith("0") && digits.length > 1) {
    return `+${calling}${digits.slice(1)}`
  }
  return `+${calling}${digits}`
}

/** Strip country prefix for local-only MoMo input fields. */
export function parseYcMomoLocalPhone(phone: string, countryCode: string): string {
  const trimmed = String(phone ?? "").trim()
  if (!trimmed) return ""

  let digits = trimmed.replace(/[\s().-]/g, "").replace(/\D/g, "")
  if (trimmed.startsWith("+")) {
    digits = trimmed.slice(1).replace(/\D/g, "")
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2)
  }

  const calling = resolveYcMomoCallingCode(countryCode)
  if (calling && digits.startsWith(calling) && digits.length > calling.length) {
    return digits.slice(calling.length)
  }
  if (digits.startsWith("0") && digits.length > 1) {
    return digits.slice(1)
  }
  return digits
}

export function buildYcMomoPhoneFromLocal(localDigits: string, countryCode: string): string {
  const local = String(localDigits ?? "").replace(/\D/g, "")
  if (!local) return ""
  return normalizeYcMomoPhone(local, countryCode)
}

export function sanitizeYcMomoLocalPhoneInput(value: string): string {
  return String(value ?? "").replace(/\D/g, "")
}
