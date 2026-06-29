import { createSupabaseAdmin } from "@/lib/supabase/admin"
import crypto from "crypto"

export type InvoiceWebhookEvent =
  | "invoice.finalized"
  | "invoice.sent"
  | "invoice.viewed"
  | "invoice.paid"
  | "invoice.past_due"
  | "invoice.voided"
  | "invoice.quote_accepted"

export async function dispatchInvoiceWebhooks(input: {
  businessId: string
  event: InvoiceWebhookEvent
  payload: Record<string, unknown>
}): Promise<void> {
  try {
    const admin = createSupabaseAdmin()
    const { data: endpoints } = await admin
      .from("invoice_webhook_endpoints")
      .select("id, url, secret, events")
      .eq("business_id", input.businessId)
      .eq("enabled", true)

    for (const ep of endpoints ?? []) {
      const events = (ep.events as string[] | null) ?? []
      if (!events.includes(input.event)) continue

      const body = JSON.stringify({
        event: input.event,
        data: input.payload,
        timestamp: new Date().toISOString(),
      })

      const { error: insErr } = await admin.from("invoice_webhook_deliveries").insert({
        endpoint_id: ep.id,
        event: input.event,
        payload: JSON.parse(body),
        status: "pending",
      })

      if (insErr) {
        console.error("webhook delivery insert:", insErr)
        continue
      }

      void deliverWebhook(String(ep.url), String(ep.secret), body).catch((e) =>
        console.error("webhook deliver:", e),
      )
    }
  } catch (e) {
    console.error("dispatchInvoiceWebhooks:", e)
  }
}

async function deliverWebhook(url: string, secret: string, body: string): Promise<void> {
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex")
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Easner-Signature": sig,
    },
    body,
  })
}
