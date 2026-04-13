import { createNoahSignatureJwt } from "./signing"
import { getNoahApiKey, getNoahBaseUrl, getNoahSigningPrivateKey } from "./config"

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
  /** OpenAPI path only, e.g. /customers/foo or /customers/foo/bar */
  path: string
  query?: Record<string, string | number | boolean | undefined>
  /** JSON body — will be serialized with JSON.stringify (compact, no extra spaces). */
  json?: unknown
}

export async function noahFetch<T>(opts: NoahFetchOptions): Promise<T> {
  const base = getNoahBaseUrl()
  const key = getNoahApiKey()
  if (!key) {
    throw new Error("NOAH_API_KEY is not configured")
  }

  const signingKey = getNoahSigningPrivateKey()
  const qp = new URLSearchParams()
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue
      qp.set(k, String(v))
    }
  }
  const qs = qp.toString()
  const fullUrl = `${base}${opts.path}${qs ? `?${qs}` : ""}`

  const urlObj = new URL(fullUrl)
  const jwtPath = urlObj.pathname

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

  if (signingKey) {
    const queryParamsForJwt: Record<string, string | number | boolean | undefined> | undefined =
      opts.query && Object.keys(opts.query).length > 0 ? opts.query : undefined
    headers["Api-Signature"] = createNoahSignatureJwt({
      method: opts.method,
      path: jwtPath,
      queryParams: queryParamsForJwt,
      body: bodyBuf,
      privateKeyPem: signingKey,
    })
  }

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
