import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { isTerminalSessionId, paymentLinkPublicIdToUuid } from "./public-id"
import { normalizePaymentLinkSlug } from "./slug"

export type PublicPayResolution =
  | { kind: "payment_link"; row: Record<string, unknown> }
  | { kind: "stablecoin_session"; sessionId: string }
  | { kind: "not_found" }

const LINK_COLUMNS =
  "id, public_id, business_id, slug, label, description, amount_cents, currency, rail, mode, billing_interval, trial_days, redirect_url, stripe_price_id, autopayout_config_id, payment_count, archived_at, created_at"

async function findLinkById(
  admin: SupabaseClient,
  id: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from("payment_links")
    .select(LINK_COLUMNS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

async function findLinkByEasetagSlug(
  admin: SupabaseClient,
  easetag: string,
  slug: string,
): Promise<Record<string, unknown> | null> {
  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("easetag", easetag)
    .maybeSingle()
  if (!biz?.id) return null

  const { data } = await admin
    .from("payment_links")
    .select(LINK_COLUMNS)
    .eq("business_id", biz.id as string)
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

/**
 * Resolve a pay.easner.com path. One segment is either a typed `plink_` id or a
 * stablecoin session UUID; two segments are `{easetag}/{slug}` with the same
 * UUID escape hatch for stablecoin charges shared under a business's tag.
 */
export async function resolvePublicPayPath(
  admin: SupabaseClient,
  segments: string[],
): Promise<PublicPayResolution> {
  const parts = segments.map((part) => part.trim()).filter(Boolean)

  if (parts.length === 1) {
    const [only] = parts
    const linkId = paymentLinkPublicIdToUuid(only)
    if (linkId) {
      const row = await findLinkById(admin, linkId)
      return row ? { kind: "payment_link", row } : { kind: "not_found" }
    }
    if (isTerminalSessionId(only)) {
      return { kind: "stablecoin_session", sessionId: only }
    }
    return { kind: "not_found" }
  }

  if (parts.length === 2) {
    const [rawTag, second] = parts
    if (isTerminalSessionId(second)) {
      return { kind: "stablecoin_session", sessionId: second }
    }
    const easetag = normalizeEasetag(rawTag)
    const slug = normalizePaymentLinkSlug(second)
    if (!easetag || !slug) return { kind: "not_found" }
    const row = await findLinkByEasetagSlug(admin, easetag, slug)
    return row ? { kind: "payment_link", row } : { kind: "not_found" }
  }

  return { kind: "not_found" }
}
