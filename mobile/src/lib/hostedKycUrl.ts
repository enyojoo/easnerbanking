/**
 * Hosted KYC/KYB URLs for the Expo web iframe modal (same idea as Noah checkout).
 * Native iOS/Android keep the original URL and open it in Safari / Chrome Custom Tabs.
 */
export function hostedKycUrlForWebEmbed(link: string, iframeOrigin: string): string {
  try {
    const url = new URL(link)
    const host = url.hostname.toLowerCase()
    const origin = iframeOrigin.trim()
    const isPersona = host.includes('withpersona.com') || host.includes('persona.com')
    const isNoah = host.includes('noah.com')
    if (!isPersona && !isNoah) return link

    if (url.pathname.includes('/verify')) {
      url.pathname = url.pathname.replace('/verify', '/widget')
    }
    if (origin && !url.searchParams.has('iframe-origin')) {
      url.searchParams.set('iframe-origin', origin)
    }
    return url.toString()
  } catch {
    return link
  }
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  return data as Record<string, unknown>
}

export function signedAgreementIdFromUnknown(data: unknown): string | null {
  const rec = asRecord(data)
  if (!rec) return null
  const id = String(rec.signedAgreementId ?? rec.signed_agreement_id ?? '').trim()
  return id && id.length <= 1024 ? id : null
}

export function signedAgreementIdFromUrl(href: string): string | null {
  try {
    const url = new URL(href)
    const id = String(
      url.searchParams.get('signed_agreement_id') ?? url.searchParams.get('signedAgreementId') ?? '',
    ).trim()
    return id && id.length <= 1024 ? id : null
  } catch {
    return null
  }
}

export function isBridgeTosAcceptedMessage(data: unknown): boolean {
  const rec = asRecord(data)
  if (!rec) return false
  if (rec.type === 'bridgeTosAccepted' || rec.bridgeTosAccepted === true) return true
  return Boolean(signedAgreementIdFromUnknown(rec))
}

export function isHostedVerificationCompleteMessage(data: unknown): boolean {
  const rec = asRecord(data)
  if (!rec) return false
  if (isBridgeTosAcceptedMessage(rec)) return false
  if (rec.hostedComplete === true || rec.kycCompleted === true || rec.type === 'kycCompleted') {
    return true
  }
  const name = String(rec.name ?? rec.event ?? '').toLowerCase()
  return name === 'complete' || name === 'inquiry-complete' || name === 'complete-inquiry'
}

/** TOS vs KYC return from `/auth/onboarding-complete`. */
export function hostedOnboardingReturnKind(href: string): 'tos' | 'complete' | null {
  const signed = signedAgreementIdFromUrl(href)
  try {
    const url = new URL(href)
    if (url.pathname.includes('/auth/onboarding-complete')) {
      if (url.searchParams.get('context') === 'bridge-tos' || signed) return 'tos'
      return 'complete'
    }
    return signed ? 'tos' : null
  } catch {
    if (href.includes('/auth/onboarding-complete')) {
      return href.includes('bridge-tos') || Boolean(signed) ? 'tos' : 'complete'
    }
    return signed ? 'tos' : null
  }
}

export function isHostedKycMessageOrigin(origin: string, appOrigin: string): boolean {
  if (origin === appOrigin) return true
  try {
    const host = new URL(origin).hostname.toLowerCase()
    return (
      host === 'withpersona.com' ||
      host.endsWith('.withpersona.com') ||
      host.includes('noah.com') ||
      host.includes('bridge.xyz') ||
      host === 'easner.com' ||
      host.endsWith('.easner.com')
    )
  } catch {
    return false
  }
}
