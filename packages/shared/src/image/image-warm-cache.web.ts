const STORAGE_KEY = "easner_img_warm_v2"
const MAX_PERSISTED = 600
const PERSIST_DEBOUNCE_MS = 500

const loadedUrls = new Set<string>()
const inflight = new Map<string, Promise<boolean>>()
let persistTimer: ReturnType<typeof setTimeout> | null = null

/**
 * localStorage, not sessionStorage: the warm-set exists to remember "this URL
 * is in the HTTP cache, skip re-warming it". sessionStorage died with the
 * tab, so every new tab re-warmed (re-downloaded checks for) everything.
 */
function readPersisted(): void {
  if (typeof window === "undefined") return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return
    for (const url of parsed) {
      if (typeof url === "string" && url.trim()) loadedUrls.add(url.trim())
    }
  } catch {
    // ignore quota / parse errors
  }
}

/**
 * Debounced: the old per-onLoad synchronous rewrite meant a 200-flag country
 * picker did 200 JSON.stringify + storage writes on the main thread, delaying
 * the very image reveals it was tracking.
 */
function schedulePersist(): void {
  if (typeof window === "undefined" || persistTimer != null) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      const list = [...loadedUrls].slice(-MAX_PERSISTED)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch {
      // ignore
    }
  }, PERSIST_DEBOUNCE_MS)
}

readPersisted()

export function isImageWarm(url: string | null | undefined): boolean {
  const trimmed = String(url ?? "").trim()
  return trimmed.length > 0 && loadedUrls.has(trimmed)
}

export function markImageWarm(url: string | null | undefined): void {
  const trimmed = String(url ?? "").trim()
  if (!trimmed || loadedUrls.has(trimmed)) return
  loadedUrls.add(trimmed)
  schedulePersist()
}

function loadViaImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      markImageWarm(url)
      resolve(true)
    }
    img.onerror = () => resolve(false)
    img.src = url
  })
}

/** Prefetch an image URL; resolves when cached in memory/storage or load fails. */
export function warmImageUrl(url: string | null | undefined, onReady?: () => void): void {
  const trimmed = String(url ?? "").trim()
  if (!trimmed) return
  if (loadedUrls.has(trimmed)) {
    onReady?.()
    return
  }

  const existing = inflight.get(trimmed)
  if (existing) {
    void existing.then((ok) => {
      if (ok) onReady?.()
    })
    return
  }

  const promise = loadViaImage(trimmed).finally(() => {
    inflight.delete(trimmed)
  })
  inflight.set(trimmed, promise)
  void promise.then((ok) => {
    if (ok) onReady?.()
  })
}

export function warmImageUrls(urls: Iterable<string | null | undefined>): void {
  for (const url of urls) warmImageUrl(url)
}
