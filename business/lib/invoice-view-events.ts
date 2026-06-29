import { createSupabaseAdmin } from "@/lib/supabase/admin"

export interface InvoiceViewEvent {
  invoiceId: string
  viewedAt: string
  viewerIp?: string
}

type ViewRow = {
  invoice_id: string
  viewed_at: string
  viewer_ip: string | null
}

/** In-memory fallback when DB table is unavailable (local dev without migration). */
const memoryEvents: InvoiceViewEvent[] = []

function useMemoryFallback(): boolean {
  return process.env.INVOICE_VIEW_EVENTS_MEMORY === "1"
}

export async function addInvoiceViewEvent(
  invoiceId: string,
  viewerIp?: string,
): Promise<{ recorded: boolean; isFirstCustomerView: boolean }> {
  if (useMemoryFallback()) {
    const prior = memoryEvents.filter((e) => e.invoiceId === invoiceId)
    memoryEvents.push({
      invoiceId,
      viewedAt: new Date().toISOString(),
      viewerIp,
    })
    return { recorded: true, isFirstCustomerView: prior.length === 0 }
  }

  const admin = createSupabaseAdmin()
  const { count, error: countErr } = await admin
    .from("invoice_view_events")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId)

  if (countErr) {
    console.error("invoice_view_events count:", countErr)
    memoryEvents.push({
      invoiceId,
      viewedAt: new Date().toISOString(),
      viewerIp,
    })
    const prior = memoryEvents.filter((e) => e.invoiceId === invoiceId)
    return { recorded: true, isFirstCustomerView: prior.length === 1 }
  }

  const isFirst = (count ?? 0) === 0

  const { error } = await admin.from("invoice_view_events").insert({
    invoice_id: invoiceId,
    viewed_at: new Date().toISOString(),
    viewer_ip: viewerIp ?? null,
  })

  if (error) {
    console.error("invoice_view_events insert:", error)
    return { recorded: false, isFirstCustomerView: false }
  }

  return { recorded: true, isFirstCustomerView: isFirst }
}

export async function getInvoiceViewEvents(invoiceId: string): Promise<InvoiceViewEvent[]> {
  if (useMemoryFallback()) {
    return memoryEvents
      .filter((e) => e.invoiceId === invoiceId)
      .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoice_view_events")
    .select("invoice_id, viewed_at, viewer_ip")
    .eq("invoice_id", invoiceId)
    .order("viewed_at", { ascending: false })

  if (error) {
    console.error("invoice_view_events select:", error)
    return memoryEvents
      .filter((e) => e.invoiceId === invoiceId)
      .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
  }

  return ((data ?? []) as ViewRow[]).map((row) => ({
    invoiceId: row.invoice_id,
    viewedAt: row.viewed_at,
    viewerIp: row.viewer_ip ?? undefined,
  }))
}
