import { getGridBaseUrl, getGridClientId, getGridClientSecret, isGridConfigured } from "./config"

/**
 * A hung provider socket must never hang the Send UI: without a signal, a
 * dead connection rides to the platform function limit. 20s is far above any
 * legitimate call on these APIs. (docs/speed-ux-plan.md money-flow pass)
 */
const GRID_HTTP_TIMEOUT_MS = 20_000

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
  formData?: FormData
  headers?: Record<string, string>
  idempotencyKey?: string
  /**
   * Override the 20s default for calls that legitimately run long: KYB
   * multipart document uploads and cron-side pagination sweeps. Interactive
   * quote/confirm paths must keep the default.
   */
  timeoutMs?: number
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
  const formData = opts.formData
  const jsonBody = formData ? undefined : opts.json != null ? JSON.stringify(opts.json) : undefined
  const headers: Record<string, string> = {
    Authorization: buildBasicAuthHeader(),
    Accept: "application/json",
    ...(jsonBody ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers ?? {}),
  }
  if (opts.idempotencyKey?.trim()) {
    headers["Idempotency-Key"] = opts.idempotencyKey.trim()
  }

  const res = await fetch(url, {
    method: opts.method,
    headers,
    ...(formData ? { body: formData } : jsonBody ? { body: jsonBody } : {}),
    signal: AbortSignal.timeout(opts.timeoutMs ?? GRID_HTTP_TIMEOUT_MS),
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

const GRID_LIST_MAX_PAGES = 20

export function resolveGridListNextCursor(input: {
  nextCursor?: string | null
  cursor?: string | null
  previousCursor?: string
  rowCount: number
}): string | undefined {
  if (input.rowCount <= 0) return undefined
  const next = input.nextCursor
    ? String(input.nextCursor)
    : input.cursor
      ? String(input.cursor)
      : ""
  if (!next || next === input.previousCursor) return undefined
  return next
}

/** Paginate Grid list endpoints with `data` + optional cursor. */
export async function gridFetchAllPages<T>(input: {
  path: string
  query?: Record<string, string | number | boolean | undefined>
  mapPage: (payload: { data?: T[]; cursor?: string | null }) => T[]
  /** Cap pages so a sticky cursor cannot hang quote/confirm for tens of seconds. */
  maxPages?: number
  /** Per-page timeout override (cron sweeps); the 20s default applies per page, not to the whole sweep. */
  timeoutMs?: number
}): Promise<T[]> {
  const out: T[] = []
  let cursor: string | undefined
  const maxPages = input.maxPages ?? GRID_LIST_MAX_PAGES
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(input.query ?? {})) {
      if (v != null && String(v).trim()) params.set(k, String(v))
    }
    if (cursor) params.set("cursor", cursor)
    const qs = params.toString()
    const path = qs ? `${input.path}?${qs}` : input.path
    const page = await gridFetch<{
      data?: T[]
      cursor?: string | null
      nextCursor?: string | null
    }>({
      method: "GET",
      path,
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    })
    const rows = input.mapPage(page)
    out.push(...rows)
    const next = resolveGridListNextCursor({
      nextCursor: page.nextCursor,
      cursor: page.cursor,
      previousCursor: cursor,
      rowCount: rows.length,
    })
    if (!next) break
    cursor = next
  }
  return out
}
