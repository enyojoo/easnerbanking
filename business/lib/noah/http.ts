import { createNoahSignatureJwt } from "./signing"
import { getNoahApiKey, getNoahBaseUrl, getNoahSigningPrivateKey } from "./config"
import { assertNoahEs384SigningPrivateKeyPem } from "./normalize-signing-key"

/** Thrown by `noahFetch` on non-OK responses; use `status` for reliable 404 detection (Noah `Detail` text varies). */
export class NoahHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
    public readonly type?: string,
    /** Parsed JSON error body from Noah (for server logs). */
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = "NoahHttpError"
  }
}

export type NoahFetchOptions = {
  method: "GET" | "POST" | "PUT"
  /** OpenAPI path segment; JWT `path` claim is `/v1` + this (Noah docs). */
  path: string
  query?: Record<string, string | number | boolean | undefined>
  /** JSON body — same bytes are hashed (`bodyHash`) and sent on the wire. */
  json?: unknown
}

/** JWT `path` claim — e.g. `/v1/transactions` (Noah signing docs). */
export function toNoahSignedPath(openApiPath: string): string {
  const p = openApiPath.startsWith("/") ? openApiPath : `/${openApiPath}`
  if (p === "/v1" || p.startsWith("/v1/")) return p
  return `/v1${p}`
}

function getNoahApiOrigin(): string {
  const base = getNoahBaseUrl().replace(/\/$/, "")
  if (base.endsWith("/v1")) return base.slice(0, -3)
  return base
}

export function isNoahSignatureErrorMessage(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes("token signature invalid") ||
    m.includes("invalid signature") ||
    m.includes("api-signature")
  )
}

export function formatNoahSignatureHelpError(detail: string): string {
  return [
    detail,
    "Per Noah signing docs: use an ES384 (secp384r1) key pair — openssl ecparam -name secp384r1 -genkey -noout -out private-key.pem; upload public-key.pem on this production API key; set NOAH_SIGNING_PRIVATE_KEY to the private PEM in Vercel.",
    "https://docs.noah.com/api-concepts/authentication/signing",
  ].join(" ")
}

/**
 * Signed Noah API request — same body buffer for JWT `bodyHash` and fetch body (Noah docs).
 */
export async function noahFetch<T>(opts: NoahFetchOptions): Promise<T> {
  const apiKey = getNoahApiKey()
  if (!apiKey) {
    throw new Error("NOAH_API_KEY is not configured")
  }

  const signingKeyRaw = getNoahSigningPrivateKey().trim()
  if (!signingKeyRaw) {
    throw new Error("NOAH_SIGNING_PRIVATE_KEY is required for Noah production API requests")
  }

  const privateKey = assertNoahEs384SigningPrivateKeyPem(signingKeyRaw)

  const path = toNoahSignedPath(opts.path)

  let queryParamsForJwt: Record<string, string | number> | undefined
  if (opts.query) {
    const entries = Object.entries(opts.query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, typeof v === "boolean" ? String(v) : v] as [string, string | number])
    if (entries.length > 0) {
      queryParamsForJwt = Object.fromEntries(entries)
    }
  }

  const qp = new URLSearchParams()
  if (queryParamsForJwt) {
    for (const [k, v] of Object.entries(queryParamsForJwt)) {
      qp.set(k, String(v))
    }
  }
  const qs = qp.toString()
  const origin = getNoahApiOrigin()
  const fullUrl = `${origin}${path}${qs ? `?${qs}` : ""}`

  let body: Buffer | undefined
  if (opts.json !== undefined) {
    body = Buffer.from(JSON.stringify(opts.json), "utf8")
  }

  const signature = createNoahSignatureJwt({
    body,
    method: opts.method,
    path,
    privateKey,
    queryParams: queryParamsForJwt,
  })

  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "Api-Signature": signature,
  }
  if (body) {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(fullUrl, {
    method: opts.method,
    headers,
    body: body !== undefined ? new Uint8Array(body) : undefined,
  })

  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    const err = data as { Detail?: string; Type?: string; title?: string }
    const detail = String(err?.Detail ?? "").trim() || undefined
    const type = String(err?.Type ?? err?.title ?? "").trim() || undefined
    const message =
      detail || type || `Noah API ${res.status}: ${text.slice(0, 500)}`
    throw new NoahHttpError(message, res.status, detail, type, data)
  }

  return data as T
}
