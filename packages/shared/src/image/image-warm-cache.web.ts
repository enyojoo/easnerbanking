const STORAGE_KEY = "easner_img_warm_v1"
const MAX_PERSISTED = 400

const loadedUrls = new Set<string>()
const inflight = new Map<string, Promise<boolean>>()

function readPersisted(): void {
  if (typeof window === "undefined") return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
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

function persistLoaded(): void {
  if (typeof window === "undefined") return
  try {
    const list = [...loadedUrls].slice(-MAX_PERSISTED)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
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
  persistLoaded()
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

/** Prefetch an image URL; resolves when cached in memory/session or load fails. */
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
