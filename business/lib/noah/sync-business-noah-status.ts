import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"

export type SyncBusinessNoahStatusResult = {
  ok: boolean
  needsFiatAccounts?: boolean
}

/**
 * POST `/api/noah/sync-status` with business scope — pulls KYB status and provisions fiat VAs when approved.
 */
export async function syncBusinessNoahStatus(): Promise<SyncBusinessNoahStatusResult> {
  try {
    const supabase = createSupabaseBrowser()
    const { data } = await supabase.auth.getSession()
    if (!data.session) return { ok: false }

    const res = await fetchWithSession("/api/noah/sync-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Easner-Noah-Scope": "business",
      },
    })
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
    return { ok: true, needsFiatAccounts }
  } catch {
    return { ok: false }
  }
}
