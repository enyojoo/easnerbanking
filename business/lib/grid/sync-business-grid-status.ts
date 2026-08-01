import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

export type SyncBusinessGridStatusResult = {
  ok: boolean
  needsFiatAccounts?: boolean
  accountsReady?: boolean
}

const SYNC_STATUS_TIMEOUT_MS = 65_000
const ACCOUNT_SETUP_POLL_INTERVAL_MS = 4_000
const ACCOUNT_SETUP_MAX_WAIT_MS = 60_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function syncBusinessGridStatusOnce(): Promise<SyncBusinessGridStatusResult> {
  try {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.auth.getSession()
    if (!data.session) return { ok: false }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SYNC_STATUS_TIMEOUT_MS)

    const res = await fetchWithSession("/api/grid/sync-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const text = await res.text()
    if (!res.ok) return { ok: false }

    let needsFiatAccounts: boolean | undefined
    if (text) {
      try {
        const json = JSON.parse(text) as { needsFiatAccounts?: boolean }
        needsFiatAccounts = json.needsFiatAccounts
      } catch {
        /* ignore */
      }
    }

    window.dispatchEvent(new Event("business-profile-updated"))
    return {
      ok: true,
      needsFiatAccounts,
      accountsReady: needsFiatAccounts === false,
    }
  } catch {
    return { ok: false }
  }
}

export async function syncBusinessGridStatus(): Promise<SyncBusinessGridStatusResult> {
  return syncBusinessGridStatusOnce()
}

export async function syncBusinessGridStatusUntilAccountsReady(options?: {
  maxWaitMs?: number
  pollIntervalMs?: number
}): Promise<SyncBusinessGridStatusResult> {
  const maxWaitMs = options?.maxWaitMs ?? ACCOUNT_SETUP_MAX_WAIT_MS
  const pollIntervalMs = options?.pollIntervalMs ?? ACCOUNT_SETUP_POLL_INTERVAL_MS
  const deadline = Date.now() + maxWaitMs
  let last: SyncBusinessGridStatusResult = { ok: false }

  while (Date.now() <= deadline) {
    last = await syncBusinessGridStatusOnce()
    if (!last.ok) {
      if (Date.now() + pollIntervalMs > deadline) break
      await sleep(pollIntervalMs)
      continue
    }
    if (last.needsFiatAccounts === false) {
      return { ...last, accountsReady: true }
    }
    if (Date.now() + pollIntervalMs > deadline) break
    await sleep(pollIntervalMs)
  }

  return {
    ...last,
    accountsReady: last.needsFiatAccounts === false,
  }
}
