/**
 * Transform a Bridge hosted KYC/KYB URL for embedding in Settings
 * (`?flow=bridge`), matching Bridge's Persona widget docs:
 * add `iframe-origin` and rewrite `/verify` → `/widget`.
 */
export function buildBridgeHostedIframeUrl(link: string, iframeOrigin: string): string {
  try {
    const url = new URL(link)
    const host = url.hostname.toLowerCase()
    const isPersona = host.includes("withpersona.com") || host.includes("persona.com")
    if (!isPersona) return link

    if (url.pathname.includes("/verify")) {
      url.pathname = url.pathname.replace("/verify", "/widget")
    }

    const origin = iframeOrigin.trim()
    if (origin && !url.searchParams.has("iframe-origin")) {
      url.searchParams.set("iframe-origin", origin)
    }

    return url.toString()
  } catch {
    return link
  }
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null
  return data as Record<string, unknown>
}

export function normalizeSignedAgreementId(raw: unknown): string | null {
  const id = String(raw ?? "").trim()
  if (!id || id.length > 1024) return null
  return id
}

/** Bridge TOS return / postMessage — required to PUT the agreement onto the customer. */
export function signedAgreementIdFromUnknown(data: unknown): string | null {
  const rec = asRecord(data)
  if (!rec) return null
  return (
    normalizeSignedAgreementId(rec.signedAgreementId) ??
    normalizeSignedAgreementId(rec.signed_agreement_id)
  )
}

export function signedAgreementIdFromUrl(href: string): string | null {
  try {
    const url = new URL(href)
    return (
      normalizeSignedAgreementId(url.searchParams.get("signed_agreement_id")) ??
      normalizeSignedAgreementId(url.searchParams.get("signedAgreementId"))
    )
  } catch {
    return null
  }
}

/** TOS accepted — not the end of KYC/KYB. */
export function isBridgeTosAcceptedMessage(data: unknown): boolean {
  const rec = asRecord(data)
  if (!rec) return false
  if (rec.type === "bridgeTosAccepted" || rec.bridgeTosAccepted === true) return true
  return Boolean(signedAgreementIdFromUnknown(rec))
}

/** Parent `postMessage` from `/auth/onboarding-complete` or Persona's widget complete. */
export function isHostedVerificationCompleteMessage(data: unknown): boolean {
  const rec = asRecord(data)
  if (!rec) return false
  if (isBridgeTosAcceptedMessage(rec)) return false
  if (rec.hostedComplete === true || rec.kycCompleted === true || rec.type === "kycCompleted") {
    return true
  }
  const name = String(rec.name ?? rec.event ?? "").toLowerCase()
  return name === "complete" || name === "inquiry-complete" || name === "complete-inquiry"
}

export function isBridgeHostedMessageOrigin(origin: string, appOrigin: string): boolean {
  if (origin === appOrigin) return true
  try {
    const host = new URL(origin).hostname.toLowerCase()
    if (host === "withpersona.com" || host.endsWith(".withpersona.com")) return true
    if (host === "easner.com" || host.endsWith(".easner.com")) return true
    return host === "bridge.xyz" || host.endsWith(".bridge.xyz")
  } catch {
    return false
  }
}
