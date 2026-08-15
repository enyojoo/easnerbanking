import { fetchWithSession } from "@/lib/fetch-with-session"

export type HostedCredentials = {
  link: string | null
  token: string | null
}

export type HostedCredentialsFetchResult = HostedCredentials & {
  json: {
    kyc_link?: string | null
    kyc_token?: string | null
    error?: string
    alreadyOnboarded?: boolean
    kyc_status?: string
    canResubmit?: boolean
  }
  res: Response
}

const credentialsCache = new Map<string, HostedCredentials>()
const resumeAvailableCache = new Map<string, boolean>()
const inFlightByBusinessId = new Map<string, Promise<HostedCredentialsFetchResult>>()

export function readHostedCredentialsCache(businessId: string | null | undefined): HostedCredentials {
  if (!businessId) return { link: null, token: null }
  return credentialsCache.get(businessId) ?? { link: null, token: null }
}

export function hostedCredentialsAreReady(credentials: HostedCredentials): boolean {
  return Boolean(credentials.link?.trim() || credentials.token?.trim())
}

export function readHostedResumeAvailable(businessId: string | null | undefined): boolean | null {
  if (!businessId) return null
  return resumeAvailableCache.get(businessId) ?? null
}

function storeHostedCredentials(businessId: string, credentials: HostedCredentials) {
  credentialsCache.set(businessId, credentials)
  resumeAvailableCache.set(businessId, hostedCredentialsAreReady(credentials))
}

export function writeHostedCredentialsCache(businessId: string, credentials: HostedCredentials) {
  storeHostedCredentials(businessId, credentials)
}

export async function fetchHostedVerificationCredentials(): Promise<HostedCredentialsFetchResult> {
  const res = await fetchWithSession("/api/grid/kyc-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "business" }),
  })
  const text = await res.text()
  let json = {} as HostedCredentialsFetchResult["json"]
  if (text) {
    try {
      json = JSON.parse(text) as HostedCredentialsFetchResult["json"]
    } catch {
      json = {}
    }
  }
  const linkRaw = typeof json.kyc_link === "string" ? json.kyc_link.trim() : ""
  const tokenRaw = typeof json.kyc_token === "string" ? json.kyc_token.trim() : ""
  return {
    link: linkRaw || null,
    token: tokenRaw || null,
    json,
    res,
  }
}

export type PrimeHostedVerificationOptions = {
  businessId: string
  /** Skip network when cache already has a link or token. Default true. */
  useCache?: boolean
}

/**
 * Warm Grid KYB credentials before the user clicks Begin verification.
 * Dedupes concurrent requests per business.
 */
export async function primeHostedVerificationCredentials(
  options: PrimeHostedVerificationOptions,
): Promise<HostedCredentialsFetchResult> {
  const { businessId, useCache = true } = options
  if (useCache) {
    const cached = readHostedCredentialsCache(businessId)
    if (hostedCredentialsAreReady(cached)) {
      return {
        link: cached.link,
        token: cached.token,
        json: {},
        res: new Response(null, { status: 200 }),
      }
    }
  }

  let inFlight = inFlightByBusinessId.get(businessId)
  if (!inFlight) {
    inFlight = fetchHostedVerificationCredentials().then((result) => {
      if (result.res.ok) {
        storeHostedCredentials(businessId, { link: result.link, token: result.token })
      }
      return result
    })
    inFlightByBusinessId.set(businessId, inFlight)
    void inFlight.finally(() => {
      if (inFlightByBusinessId.get(businessId) === inFlight) {
        inFlightByBusinessId.delete(businessId)
      }
    })
  }

  return inFlight
}

export function preloadSumsubWebSdk(): void {
  void import("@sumsub/websdk")
}
