import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ACCOUNT_LOCKED_CODE,
  ACCOUNT_RESTRICTED_CODE,
  accountRestrictionDepositsBlockedCopy,
  accountRestrictionLockedCopy,
  accountRestrictionSendBlockedCopy,
  type ResolvedAccountRestriction,
} from "@easner/shared"
import { resolveAccountRestriction, type ResolveAccountRestrictionInput } from "./store"

export type AccountRestrictionIntent = "deposit" | "send" | "login"

export type AccountRestrictionDeny = {
  ok: false
  code: typeof ACCOUNT_RESTRICTED_CODE | typeof ACCOUNT_LOCKED_CODE
  status: 403
  message: string
}

export type AccountRestrictionAllow = { ok: true; restriction: ResolvedAccountRestriction }

export type AccountRestrictionAssertResult = AccountRestrictionAllow | AccountRestrictionDeny

export function accountRestrictionErrorResponse(deny: AccountRestrictionDeny): NextResponse {
  return NextResponse.json(
    { error: deny.message, code: deny.code },
    { status: deny.status },
  )
}

export async function assertAccountAllows(
  admin: SupabaseClient,
  input: ResolveAccountRestrictionInput,
  intent: AccountRestrictionIntent,
): Promise<AccountRestrictionAssertResult> {
  const restriction = await resolveAccountRestriction(admin, input)

  if (!restriction.active) {
    return { ok: true, restriction }
  }

  if (intent === "deposit") {
    return {
      ok: false,
      code: ACCOUNT_RESTRICTED_CODE,
      status: 403,
      message: accountRestrictionDepositsBlockedCopy(),
    }
  }

  if (intent === "send") {
    return {
      ok: false,
      code: restriction.phase === "locked" ? ACCOUNT_LOCKED_CODE : ACCOUNT_RESTRICTED_CODE,
      status: 403,
      message:
        restriction.phase === "locked"
          ? accountRestrictionLockedCopy()
          : accountRestrictionSendBlockedCopy(),
    }
  }

  if (intent === "login" && restriction.phase === "locked") {
    return {
      ok: false,
      code: ACCOUNT_LOCKED_CODE,
      status: 403,
      message: accountRestrictionLockedCopy(),
    }
  }

  return { ok: true, restriction }
}

export async function requireAccountAllows(
  admin: SupabaseClient,
  input: ResolveAccountRestrictionInput,
  intent: AccountRestrictionIntent,
): Promise<AccountRestrictionAllow | NextResponse> {
  const result = await assertAccountAllows(admin, input, intent)
  if (!result.ok) return accountRestrictionErrorResponse(result)
  return result
}
