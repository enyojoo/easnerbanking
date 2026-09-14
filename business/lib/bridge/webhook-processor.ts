import type { SupabaseClient } from "@supabase/supabase-js"
import { persistVerificationStatus } from "@/lib/compliance/verification-store"
import { mapBridgeKycStatus } from "./kyc-links"
import { provisionBridgeVirtualAccounts } from "./provision-after-approval"
import { handleBridgeVaInboundActivity, resolveBridgeSubject } from "./va-inbound-webhook"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export async function applyBridgeWebhookSideEffects(
  admin: SupabaseClient,
  payload: unknown,
): Promise<void> {
  const p = asRecord(payload)
  const eventType = String(p.event_type ?? p.type ?? "").toLowerCase()
  const data = asRecord(p.event_object ?? p.data ?? p)

  if (eventType.includes("kyc_link") || eventType.includes("customer")) {
    await handleBridgeKycWebhook(admin, p, data)
  }

  if (eventType.includes("virtual_account") || eventType.includes("deposit")) {
    await handleBridgeVaInboundActivity(admin, p)
  }
}

async function handleBridgeKycWebhook(
  admin: SupabaseClient,
  payload: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<void> {
  const customerId = String(data.customer_id ?? payload.customer_id ?? data.id ?? "").trim()
  if (!customerId) return
  const status = mapBridgeKycStatus(String(data.kyc_status ?? data.status ?? ""))
  const subject = await resolveBridgeSubject(admin, customerId)
  if (!subject) return

  if (subject.businessId) {
    await admin
      .from("businesses")
      .update({
        bridge_customer_id: customerId,
        bridge_kyc_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subject.businessId)
  } else {
    await persistVerificationStatus(admin, {
      kind: "individual",
      userId: subject.userId,
      provider: "bridge",
      status,
      bridgeCustomerId: customerId,
    })
    await admin
      .from("users")
      .update({
        bridge_customer_id: customerId,
        bridge_kyc_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subject.userId)
  }

  if (status === "approved") {
    await provisionBridgeVirtualAccounts({
      admin,
      userId: subject.userId,
      businessId: subject.businessId,
      customerId,
    })
  }
}
