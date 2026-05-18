import { createNoahSignatureJwt } from "./signing"
import { getNoahApiKey, getNoahBaseUrl, getNoahSigningPrivateKey } from "./config"
import { loadNoahSigningKeyMaterial } from "./normalize-signing-key"

/** Thrown by `noahFetch` on non-OK responses; use `status` for reliable 404 detection (Noah `Detail` text varies). */
export class NoahHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "NoahHttpError"
  }
}

export type NoahFetchOptions = {
  method: "GET" | "POST" | "PUT"
  /** OpenAPI path only, e.g. `/customers/foo` or `/onboarding/:id` (without host; `/v1` added for signing). */
  path: string
  query?: Record<string, string | number | boolean | undefined>
  /** JSON body — serialized compactly; the same bytes are hashed and sent on the wire. */
  json?: unknown
}

/** Path claim for Api-Signature JWT — must match Noah docs (`/v1/...`). */
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
    "Check NOAH_SIGNING_PRIVATE_KEY: PEM must match the public key registered on this API key in the Noah dashboard.",
    "Use the ES384 (secp384r1) or ES256 (prime256v1) key pair you uploaded when creating the production API key — not a sandbox key.",
    "In Vercel, store the private key with real line breaks or literal \\n sequences between PEM lines.",
  ].join(" ")
}

export async function noahFetch<T>(opts: NoahFetchOptions): Promise<T> {
  const origin = getNoahApiOrigin()
  const key = getNoahApiKey()
  if (!key) {
    throw new Error("NOAH_API_KEY is not configured")
  }

  const signingKeyRaw = getNoahSigningPrivateKey().trim()
  if (!signingKeyRaw) {
    throw new Error("NOAH_SIGNING_PRIVATE_KEY is required for Noah production API requests")
  }

  let signingMaterial: ReturnType<typeof loadNoahSigningKeyMaterial>
  try {
    signingMaterial = loadNoahSigningKeyMaterial(signingKeyRaw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg)
  }

  const signedPath = toNoahSignedPath(opts.path)
  const qp = new URLSearchParams()
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue
      qp.set(k, String(v))
    }
  }
  const qs = qp.toString()
  const fullUrl = `${origin}${signedPath}${qs ? `?${qs}` : ""}`

  let bodyBuf: Buffer | undefined
  if (opts.json !== undefined) {
    const raw = JSON.stringify(opts.json)
    bodyBuf = Buffer.from(raw, "utf8")
  }

  const headers: Record<string, string> = {
    "X-Api-Key": key,
  }
  if (bodyBuf) {
    headers["Content-Type"] = "application/json"
  }

  const queryParamsForJwt: Record<string, string | number | boolean | undefined> | undefined =
    opts.query && Object.keys(opts.query).length > 0 ? opts.query : undefined

  headers["Api-Signature"] = createNoahSignatureJwt({
    method: opts.method,
    path: signedPath,
    queryParams: queryParamsForJwt,
    body: bodyBuf,
    privateKeyPem: signingMaterial.pem,
  })

  const res = await fetch(fullUrl, {
    method: opts.method,
    headers,
    body: bodyBuf !== undefined ? new Uint8Array(bodyBuf) : undefined,
  })

  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    const err = data as { Detail?: string; Type?: string }
    const message = err?.Detail || err?.Type || `Noah API ${res.status}: ${text.slice(0, 500)}`
    throw new NoahHttpError(message, res.status)
  }

  return data as T
}
