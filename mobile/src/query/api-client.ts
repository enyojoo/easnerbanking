/**
 * Mobile `/api/*` client used by every query/mutation hook.
 *
 * Mirrors the structure of `business/lib/query/api-client.ts` but uses a
 * Supabase bearer token (from the mobile auth session) instead of the
 * short-lived business-app session cookie.
 *
 * Errors are wrapped in `ApiError` so `createBaseQueryClient`'s retry
 * logic (via `isAuthError` / `isClientError`) short-circuits 4xx responses.
 */

import { getApiBaseUrl } from '../lib/apiClient'
import { getSessionReliable } from '../lib/authSession'

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly payload: unknown

  constructor(message: string, status: number, code: string | null, payload: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.payload = payload
  }
}

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number)[]

export interface ApiFetchOptions<TBody = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: TBody
  query?: Readonly<Record<string, QueryValue>>
  signal?: AbortSignal
  headers?: Record<string, string>
  /** Skip auth (public endpoints). */
  anonymous?: boolean
}

function buildUrl(path: string, query: ApiFetchOptions['query']): string {
  const base = getApiBaseUrl()
  const full = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return full
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v))
    } else {
      params.set(key, String(value))
    }
  }
  const qs = params.toString()
  if (!qs) return full
  return full.includes('?') ? `${full}&${qs}` : `${full}?${qs}`
}

export async function apiFetch<TResponse = unknown, TBody = unknown>(
  path: string,
  options: ApiFetchOptions<TBody> = {},
): Promise<TResponse> {
  const { method = 'GET', body, query, signal, headers, anonymous = false } = options
  const url = buildUrl(path, query)

  const authHeader: Record<string, string> = {}
  if (!anonymous) {
    const session = await getSessionReliable()
    if (!session?.access_token) {
      throw new ApiError('Not authenticated', 401, 'UNAUTHENTICATED', null)
    }
    authHeader.Authorization = `Bearer ${session.access_token}`
  }

  const init: RequestInit = {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader,
      ...headers,
    },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  const res = await fetch(url, init)
  const text = await res.text()
  const parsed = text ? safeJson(text) : undefined

  if (!res.ok) {
    const code = extractCode(parsed)
    const message = extractMessage(parsed) ?? `${method} ${path} failed (${res.status})`
    throw new ApiError(message, res.status, code, parsed)
  }

  return parsed as TResponse
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.message === 'string') return p.message
  if (typeof p.error === 'string') return p.error
  if (typeof p.error === 'object' && p.error && typeof (p.error as { message?: unknown }).message === 'string') {
    return (p.error as { message: string }).message
  }
  return null
}

function extractCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.code === 'string') return p.code
  if (typeof p.error === 'object' && p.error && typeof (p.error as { code?: unknown }).code === 'string') {
    return (p.error as { code: string }).code
  }
  return null
}
