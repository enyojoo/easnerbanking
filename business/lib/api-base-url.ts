import { joinApiPath, resolveApiUrl } from "@easner/shared"

/** Single API origin. Local: `npm run dev:api` on port 3002. */
export function getApiBaseUrl(): string {
  return resolveApiUrl()
}

/** Absolute URL for a same-app `/api/...` or `/v1/...` path. */
export function apiUrl(path: string): string {
  return joinApiPath(path)
}

/** Resolve a fetch input so relative `/api` paths hit the API origin. */
export function resolveApiRequestInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === "string") {
    if (input.startsWith("/")) return apiUrl(input)
    return input
  }
  if (input instanceof URL && input.origin === "null") {
    return apiUrl(`${input.pathname}${input.search}${input.hash}`)
  }
  return input
}
