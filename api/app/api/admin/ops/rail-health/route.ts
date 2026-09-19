import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { isNewPaymentIntentsPaused } from "@/lib/ops/safe-mode"
import { getTurnkeyWebhookFeatureUrl, validateTurnkeyEnvForProduction } from "@/lib/turnkey/config"
import { isNoahConfigured } from "@/lib/noah/config"
import {
  depositOmnibusSolanaAddressEur,
  depositOmnibusSolanaAddressUsd,
  depositOmnibusAllowlistCustomerIds,
  isDepositFeePricingEnabled,
  isDepositOmnibusEnabled,
  isDepositSplitConfigValid,
  isDepositSplitDryRun,
  isDepositSplitEnabled,
} from "@/lib/deposit-omnibus/config"
import {
  countGlobalPayoutsFailedWithoutReversal,
  listGlobalPayoutsFailedWithoutReversal,
} from "@/lib/noah/global-payout-ledger"
import { auditTurnkeyProvisioningGaps } from "@/lib/wallet/audit-turnkey-provisioning-gaps"

export const runtime = "nodejs"

function validateWebhookUrl(url: string): string | null {
  if (!url) return "TURNKEY_WEBHOOK_URL is not configured"
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return "TURNKEY_WEBHOOK_URL must use https"
    return null
  } catch {
    return "TURNKEY_WEBHOOK_URL is not a valid URL"
  }
}

/** Provisioning + intent queue snapshot for Office / ops dashboards. */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const countWhere = async (table: string, col: string, val: string) => {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(col, val)
    if (error) return null
    return count ?? 0
  }

  const [
    jobsPending,
    jobsRetry,
    jobsDead,
    jobsAwaitingSubOrg,
    intentsAwaitingFiat,
    intentsAwaitingCrypto,
    inboxFailed,
    turnkeyInboxFailed,
    turnkeyInboxProcessed24h,
  ] = await Promise.all([
    countWhere("wallet_provisioning_jobs", "state", "pending"),
    countWhere("wallet_provisioning_jobs", "state", "retry"),
    countWhere("wallet_provisioning_jobs", "state", "dead_letter"),
    countWhere("wallet_provisioning_jobs", "state", "awaiting_sub_org"),
    countWhere("payment_intents", "status", "awaiting_fiat"),
    countWhere("payment_intents", "status", "awaiting_crypto_deposit"),
    admin.from("event_inbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin
      .from("event_inbox")
      .select("id", { count: "exact", head: true })
      .eq("provider", "turnkey")
      .eq("status", "failed"),
    admin
      .from("event_inbox")
      .select("id", { count: "exact", head: true })
      .eq("provider", "turnkey")
      .eq("status", "processed")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  const turnkeyWebhookUrl = getTurnkeyWebhookFeatureUrl()
  const turnkeyWebhookUrlError = validateWebhookUrl(turnkeyWebhookUrl)

  const [globalPayoutsFailedWithoutReversal, globalPayoutStuckSample, turnkeyProvisioningGaps] =
    await Promise.all([
      countGlobalPayoutsFailedWithoutReversal(admin),
      listGlobalPayoutsFailedWithoutReversal(admin, { limit: 5 }),
      auditTurnkeyProvisioningGaps(admin).catch(() => null),
    ])

  let depositSplitJobsPending: number | null = null
  let depositSplitJobsStuck: number | null = null
  let depositBlockedNegativeMarginCount: number | null = null
  if (isDepositSplitEnabled()) {
    const cutoff = new Date(Date.now() - 90_000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const [pendingRes, stuckRes, blockedRes] = await Promise.all([
      admin
        .from("deposit_split_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "send_submitted"]),
      admin
        .from("deposit_split_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "send_submitted"])
        .lt("updated_at", cutoff),
      admin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .contains("metadata", { deposit_split_status: "blocked_negative_margin" })
        .gte("created_at", thirtyDaysAgo),
    ])
    depositSplitJobsPending = pendingRes.count ?? null
    depositSplitJobsStuck = stuckRes.count ?? null
    depositBlockedNegativeMarginCount = blockedRes.count ?? null
  }

  return NextResponse.json({
    ok: true,
    safe_mode_new_intents: isNewPaymentIntentsPaused(),
    noah_configured: isNoahConfigured(),
    turnkey: validateTurnkeyEnvForProduction(),
    turnkey_webhook_feature: {
      name: "FEATURE_NAME_WEBHOOK",
      value: turnkeyWebhookUrl || null,
      valid: !turnkeyWebhookUrlError,
      error: turnkeyWebhookUrlError,
    },
    turnkey_event_inbox: {
      failed: turnkeyInboxFailed.count ?? null,
      processed_24h: turnkeyInboxProcessed24h.count ?? null,
    },
    wallet_provisioning_jobs: {
      pending: jobsPending,
      retry: jobsRetry,
      dead_letter: jobsDead,
      awaiting_sub_org: jobsAwaitingSubOrg,
    },
    turnkey_provisioning_gaps: turnkeyProvisioningGaps
      ? {
          parent_policy_ok: turnkeyProvisioningGaps.parentProvisioningPolicy.ok,
          parent_policy_reason: turnkeyProvisioningGaps.parentProvisioningPolicy.ok
            ? null
            : turnkeyProvisioningGaps.parentProvisioningPolicy.reason,
          approved_business_without_sub_org:
            turnkeyProvisioningGaps.summary.businessApprovedWithoutSubOrg,
          approved_individual_without_sub_org:
            turnkeyProvisioningGaps.summary.individualApprovedWithoutSubOrg,
          sample: turnkeyProvisioningGaps.approvedWithoutSubOrg.slice(0, 5),
        }
      : null,
    payment_intents: {
      awaiting_fiat: intentsAwaitingFiat,
      awaiting_crypto_deposit: intentsAwaitingCrypto,
    },
    event_inbox_failed: inboxFailed.count ?? null,
    global_payouts: {
      failed_without_reversal: globalPayoutsFailedWithoutReversal,
      sample_transaction_ids: globalPayoutStuckSample.map((r) => r.transactionId),
    },
    deposit_omnibus: {
      omnibus_enabled: isDepositOmnibusEnabled(),
      fee_pricing_enabled: isDepositFeePricingEnabled(),
      split_enabled: isDepositSplitEnabled(),
      split_dry_run: isDepositSplitDryRun(),
      split_config_valid: isDepositSplitConfigValid(),
      omnibus_address_usd_configured: Boolean(depositOmnibusSolanaAddressUsd()),
      omnibus_address_eur_configured: Boolean(depositOmnibusSolanaAddressEur()),
      allowlist_customer_count: depositOmnibusAllowlistCustomerIds().length,
      split_jobs_pending: depositSplitJobsPending,
      split_jobs_stuck: depositSplitJobsStuck,
      blocked_negative_margin_count: depositBlockedNegativeMarginCount,
    },
  })
}
