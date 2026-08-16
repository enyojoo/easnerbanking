import { getGridBaseUrl, getGridClientId, getGridClientSecret, isGridConfigured } from "./config"

export class GridHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
    public readonly method?: string,
    public readonly path?: string,
  ) {
    super(message)
    this.name = "GridHttpError"
  }
}

export type GridFetchOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  json?: unknown
  headers?: Record<string, string>
  idempotencyKey?: string
}

function buildBasicAuthHeader(): string {
  const clientId = getGridClientId()
  const clientSecret = getGridClientSecret()
  if (!clientId || !clientSecret) {
    throw new Error("GRID_CLIENT_ID and GRID_CLIENT_SECRET are required")
  }
  const token = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")
  return `Basic ${token}`
}

function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return "/"
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

export async function gridFetch<T>(opts: GridFetchOptions): Promise<T> {
  if (!isGridConfigured()) {
    throw new Error("Grid API is not configured")
  }

  const path = normalizePath(opts.path)
  const url = `${getGridBaseUrl()}${path}`
  const body = opts.json != null ? JSON.stringify(opts.json) : undefined
  const headers: Record<string, string> = {
    Authorization: buildBasicAuthHeader(),
    Accept: "application/json",
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers ?? {}),
  }
  if (opts.idempotencyKey?.trim()) {
    headers["Idempotency-Key"] = opts.idempotencyKey.trim()
  }

  const res = await fetch(url, {
    method: opts.method,
    headers,
    ...(body ? { body } : {}),
  })

  const text = await res.text()
  let parsed: unknown = text
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (res.status < 200 || res.status >= 300) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "reason" in parsed &&
      typeof (parsed as { reason?: unknown }).reason === "string"
        ? (parsed as { reason: string }).reason
        : typeof parsed === "object" &&
            parsed &&
            "message" in parsed &&
            typeof (parsed as { message?: unknown }).message === "string"
          ? (parsed as { message: string }).message
          : typeof parsed === "object" &&
              parsed &&
              "error" in parsed &&
              typeof (parsed as { error?: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : `Grid HTTP ${res.status}`
    throw new GridHttpError(message, res.status, parsed, opts.method, path)
  }

  return parsed as T
}

/** Paginate Grid list endpoints with `data` + optional cursor. */
export async function gridFetchAllPages<T>(input: {
  path: string
  query?: Record<string, string | number | boolean | undefined>
  mapPage: (payload: { data?: T[]; cursor?: string | null }) => T[]
}): Promise<T[]> {
  const out: T[] = []
  let cursor: string | undefined
  do {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(input.query ?? {})) {
      if (v != null && String(v).trim()) params.set(k, String(v))
    }
    if (cursor) params.set("cursor", cursor)
    const qs = params.toString()
    const path = qs ? `${input.path}?${qs}` : input.path
    const page = await gridFetch<{ data?: T[]; cursor?: string | null }>({
      method: "GET",
      path,
    })
    out.push(...input.mapPage(page))
    cursor = page.cursor ? String(page.cursor) : undefined
  } while (cursor)
  return out
}
