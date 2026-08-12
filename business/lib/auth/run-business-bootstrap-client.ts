"use client"

import { fetchWithSession } from "@/lib/fetch-with-session"
import { getOnboarding } from "@/lib/onboarding-store"
import { ensureBusinessWebSurface } from "@/lib/auth/validate-surface-client"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { getPendingTeamInvite, clearPendingTeamInvite } from "@/lib/team-invite-storage"

export type RunBusinessBootstrapResult = {
  ok: boolean
  joinedViaInvite?: boolean
  businessId?: string | null
  error?: string
  code?: string
}

/**
 * Run `/api/auth/bootstrap` immediately (e.g. right after OTP verify) so org provisioning
 * finishes before dashboard/profile reads race deferred bootstrap.
 */
export async function runBusinessBootstrapClient(input?: {
  fullName?: string | null
}): Promise<RunBusinessBootstrapResult> {
  const supabase = createSupabaseBrowser()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return { ok: false, error: "No session" }
  }

  try {
    await ensureBusinessWebSurface(supabase)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Business surface validation failed",
    }
  }

  const onboarding = getOnboarding()
  const countryCode = onboarding?.countryCode?.trim() || undefined
  const pendingInvite = getPendingTeamInvite()

  const bootRes = await fetchWithSession("/api/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(countryCode ? { countryCode } : {}),
      role: "business",
      ...(input?.fullName ? { fullName: input.fullName } : {}),
      ...(pendingInvite?.membershipId ? { membershipId: pendingInvite.membershipId } : {}),
    }),
  })

  const bootJson = (await bootRes.json().catch(() => ({}))) as {
    ok?: boolean
    joinedViaInvite?: boolean
    businessId?: string | null
    error?: string
    code?: string
  }

  if (bootRes.ok && bootJson.joinedViaInvite) {
    clearPendingTeamInvite()
  }

  return {
    ok: bootRes.ok,
    joinedViaInvite: bootJson.joinedViaInvite,
    businessId: bootJson.businessId ?? null,
    error: bootJson.error,
    code: bootJson.code,
  }
}
