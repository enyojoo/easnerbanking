import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService, isSesCredentialsConfigured, isSendGridCredentialsConfigured } from "@easner/server"
import { isDisposableEmail } from "@easner/shared"
import { resolveMobileAppStoreUrls } from "@easner/shared/mobile-app-store-urls"
import { enforcePayrollRateLimit } from "@/lib/payroll/rate-limit"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AppDownloadLinkErrorCode = "RATE_LIMITED" | "DISPOSABLE_EMAIL" | "EMAIL_DISABLED"

export type AppDownloadLinkRequestResult =
  | { ok: true; sent: boolean }
  | { ok: false; code: AppDownloadLinkErrorCode; error: string }

export function normalizeMarketingEmail(input: unknown): string {
  if (typeof input !== "string") return ""
  return input.trim().toLowerCase()
}

export function isValidMarketingEmail(email: string): boolean {
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email)
}

export function isAppDownloadLinkEmailEnabled(): boolean {
  const flag = process.env.MARKETING_APP_DOWNLOAD_EMAIL_ENABLED?.trim().toLowerCase()
  if (flag === "false" || flag === "0") return false
  return isSesCredentialsConfigured() || isSendGridCredentialsConfigured()
}

export async function requestAppDownloadLinkEmail(input: {
  admin: SupabaseClient
  email: string
  clientIp: string
}): Promise<AppDownloadLinkRequestResult> {
  const email = normalizeMarketingEmail(input.email)
  if (!email || !isValidMarketingEmail(email)) {
    return { ok: true, sent: false }
  }

  if (isDisposableEmail(email)) {
    return {
      ok: false,
      code: "DISPOSABLE_EMAIL",
      error:
        "Please use a permanent email address. Temporary or disposable email providers aren't allowed.",
    }
  }

  if (!isAppDownloadLinkEmailEnabled()) {
    console.warn("[marketing] app download email skipped: disabled or email provider credentials missing")
    return {
      ok: false,
      code: "EMAIL_DISABLED",
      error: "Download links by email are temporarily unavailable. Try again later.",
    }
  }

  const ipKey = `marketing_app_download:ip:${input.clientIp}`
  const emailKey = `marketing_app_download:email:${email}`

  const ipOk = await enforcePayrollRateLimit(input.admin, ipKey, {
    limit: 10,
    windowSeconds: 3600,
  })
  if (!ipOk) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      error: "Too many requests. Please wait a while before trying again.",
    }
  }

  const emailOk = await enforcePayrollRateLimit(input.admin, emailKey, {
    limit: 3,
    windowSeconds: 3600,
  })
  if (!emailOk) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      error: "Too many requests. Please wait a while before trying again.",
    }
  }

  const urls = resolveMobileAppStoreUrls()
  const result = await emailService.sendAppDownloadLinkEmail({
    email,
    downloadPageUrl: urls.downloadPage,
  })

  if (!result.success && !result.skipped) {
    console.error("[marketing] app download email failed:", result.error)
    return {
      ok: false,
      code: "EMAIL_DISABLED",
      error: "We couldn't send your download link right now. Please try again later.",
    }
  }

  if (result.skipped) {
    console.info(`[marketing] app download email skipped to=${email}: ${result.skipReason ?? "opt-out"}`)
  }

  return { ok: true, sent: Boolean(result.success && !result.skipped) }
}
