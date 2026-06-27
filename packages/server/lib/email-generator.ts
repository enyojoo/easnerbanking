// Email template generator — Easner design system (sans-first, token-driven)

import {
  emailTheme,
  EASNER_COMPANY_ADDRESS,
  EASNER_COMPANY_ADDRESS_HTML,
  EASNER_COMPANY_LEGAL_NAME,
  EASNER_LOGO_URL_DARK,
  EASNER_LOGO_URL_LIGHT,
  resolveEmailFooterNotice,
} from "./email-theme"
import {
  getEmailAudienceProfile,
  resolveEmailAudienceFromData,
  type EmailAudience,
} from "./email-audience"

export type EmailTemplateOptions = {
  audience?: EmailAudience
  preheader?: string
  /** When true, footer includes manage-preferences link */
  showPreferencesLink?: boolean
  /** When true (default), footer uses existing-account copy; false for pre-account flows (signup OTP, invite to new email). */
  recipientHasEasnerAccount?: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Light/dark wordmarks — swapped via `prefers-color-scheme: dark` in email clients that support it. */
export function generateEmailLogoMarkup(width = 120): string {
  return `
            <img src="${EASNER_LOGO_URL_LIGHT}" alt="Easner" class="logo logo-light" width="${width}">
            <img src="${EASNER_LOGO_URL_DARK}" alt="Easner" class="logo logo-dark" width="${width}">
  `.trim()
}

export function generateBaseEmailTemplate(
  title: string,
  subtitle: string,
  content: string,
  ctaButton?: { text: string; url: string },
  options?: EmailTemplateOptions,
): string {
  const audience = options?.audience ?? "personal"
  const profile = getEmailAudienceProfile(audience)
  /** Omit product line under the title — logo + H1 only (personal and business). */
  const headerSubtitle =
    subtitle.trim() === profile.productName.trim() ? "" : subtitle
  const preheader = options?.preheader?.trim()
  const year = new Date().getFullYear()
  const t = emailTheme
  const accountNotice = resolveEmailFooterNotice(options?.recipientHasEasnerAccount !== false)

  const preferencesBlock =
    options?.showPreferencesLink !== false
      ? `<p class="footer-text" style="margin-top: 12px;">
          <a href="${profile.preferencesUrl}" style="color: ${t.primary}; text-decoration: none; font-size: 13px;">Manage email preferences</a>
        </p>`
      : ""

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - Easner</title>
    ${preheader ? `<span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ""}
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: ${t.ink};
            background-color: ${t.cloud};
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #FFFFFF;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid ${t.mist};
        }
        .email-header {
            background: #FFFFFF;
            padding: 48px 32px 32px 32px;
            text-align: center;
            border-bottom: 1px solid ${t.mist};
        }
        .logo { max-width: 120px; height: auto; margin: 0 auto 24px auto; display: block; }
        .logo-dark { display: none; }
        .email-title {
            color: ${t.graphite};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
            font-size: 28px;
            font-weight: 600;
            letter-spacing: -0.02em;
            line-height: 1.2;
            margin-bottom: 8px;
        }
        .email-subtitle { color: ${t.slate}; font-size: 15px; font-weight: 400; }
        .email-body { padding: 40px 32px; }
        .welcome-text { font-size: 17px; color: ${t.graphite}; margin-bottom: 20px; font-weight: 600; }
        .confirmation-text { font-size: 15px; color: ${t.bodyText}; margin-bottom: 24px; line-height: 1.7; }
        .cta-button {
            display: inline-block;
            background: ${t.primary};
            color: ${t.ivory} !important;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 999px;
            font-weight: 600;
            font-size: 15px;
            text-align: center;
            margin: 20px 0;
            letter-spacing: 0.01em;
        }
        .cta-button:hover { background: ${t.primaryHover}; }
        .security-note {
            background-color: ${t.cloud};
            border: 1px solid ${t.mist};
            border-left: 3px solid ${t.primary};
            padding: 20px 22px;
            margin: 28px 0;
            border-radius: 0 12px 12px 0;
        }
        .security-note h3 {
            color: ${t.graphite};
            font-size: 15px;
            margin-bottom: 6px;
            font-weight: 600;
            letter-spacing: 0.02em;
            text-transform: uppercase;
        }
        .security-note p { color: ${t.bodyText}; font-size: 15px; margin: 0; }
        .otp-container {
            background-color: ${t.cloud};
            border: 1px solid ${t.mist};
            border-radius: 12px;
            padding: 24px 22px;
            text-align: center;
            margin: 24px 0;
        }
        .otp-label {
            color: ${t.graphite};
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 12px;
        }
        .otp-code {
            font-size: 32px;
            font-weight: 600;
            color: ${t.primary};
            letter-spacing: 8px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            background: #FFFFFF;
            padding: 16px 22px;
            border-radius: 12px;
            border: 1px solid ${t.mist};
            display: inline-block;
            margin: 4px 0;
            font-variant-numeric: tabular-nums;
        }
        .otp-help { color: ${t.slate}; font-size: 13px; margin-top: 12px; line-height: 1.5; }
        .email-footer {
            background-color: #FFFFFF;
            padding: 28px 32px 32px 32px;
            text-align: center;
            border-top: 1px solid ${t.mist};
        }
        .footer-text { color: ${t.slate}; font-size: 13px; margin-bottom: 14px; }
        .footer-links { margin: 14px 0; }
        .footer-links a {
            color: ${t.primary};
            text-decoration: none;
            margin: 0 12px;
            font-size: 13px;
            font-weight: 500;
        }
        .company-info { color: #8A8F8A; font-size: 11px; line-height: 1.6; margin-top: 18px; }
        .transaction-details {
            background-color: ${t.cloud};
            border: 1px solid ${t.mist};
            border-radius: 12px;
            padding: 22px;
            margin: 24px 0;
        }
        .transaction-details h3 {
            color: ${t.graphite};
            font-size: 13px;
            margin-bottom: 14px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .transaction-details-table {
            width: 100%;
            border-collapse: collapse;
            border-spacing: 0;
        }
        .detail-row td {
            padding: 8px 0;
            border-bottom: 1px solid #EFECE2;
            font-size: 14px;
            vertical-align: top;
        }
        .detail-row:last-child td { border-bottom: none; }
        .detail-label { color: ${t.slate}; font-weight: 500; font-size: 13px; padding-right: 16px; }
        .detail-value {
            color: ${t.graphite};
            font-weight: 600;
            font-size: 14px;
            font-variant-numeric: tabular-nums;
            text-align: right;
            white-space: nowrap;
        }
        .status-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .status-pending { background-color: ${t.statusBadges.pending.bg}; color: ${t.statusBadges.pending.fg}; }
        .status-processing { background-color: ${t.statusBadges.processing.bg}; color: ${t.statusBadges.processing.fg}; }
        .status-completed, .status-settled { background-color: ${t.statusBadges.completed.bg}; color: ${t.statusBadges.completed.fg}; }
        .status-failed { background-color: ${t.statusBadges.failed.bg}; color: ${t.statusBadges.failed.fg}; }
        .status-cancelled { background-color: ${t.statusBadges.cancelled.bg}; color: ${t.statusBadges.cancelled.fg}; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #0A0B0A; color: #E5E1D5; }
            .email-container { background-color: #151817; border-color: #262926; }
            .email-header { background: #151817; border-bottom-color: #262926; }
            .logo-light { display: none !important; }
            .logo-dark { display: block !important; margin-left: auto; margin-right: auto; }
            .email-title { color: ${t.ivory}; }
            .email-subtitle { color: #8A8F8A; }
            .welcome-text { color: ${t.ivory}; }
            .confirmation-text { color: #D5D1C5; }
            .security-note { background-color: #1C201E; border-color: #262926; border-left-color: ${t.darkAccent}; }
            .security-note h3 { color: ${t.ivory}; }
            .security-note p { color: #D5D1C5; }
            .otp-container { background-color: #1C201E; border-color: #262926; }
            .otp-label { color: ${t.ivory}; }
            .otp-code {
                color: ${t.darkAccent};
                background: #0A0B0A;
                border-color: #262926;
            }
            .otp-help { color: #8A8F8A; }
            .email-footer { background-color: #151817; border-top-color: #262926; }
            .footer-text { color: #8A8F8A; }
            .footer-links a { color: ${t.darkAccent}; }
            .transaction-details { background-color: #1C201E; border-color: #262926; }
            .transaction-details h3 { color: ${t.ivory}; }
            .detail-row td { border-bottom-color: #262926; }
            .detail-label { color: #8A8F8A; }
            .detail-value { color: ${t.ivory}; }
            .cta-button { background: ${t.darkAccent}; color: ${t.ivory} !important; }
            .cta-button:hover { background: ${t.darkPrimaryHover}; }
        }
        @media only screen and (max-width: 600px) {
            .email-container { margin: 0; border-radius: 0; border-left: none; border-right: none; }
            .email-header { padding: 36px 24px 28px 24px; }
            .email-title { font-size: 24px; }
            .email-body { padding: 32px 24px; }
            .otp-code { font-size: 28px; letter-spacing: 6px; padding: 14px 18px; }
            .cta-button { display: block; width: 100%; padding: 16px 20px; }
            .email-footer { padding: 24px 20px; }
            .footer-links a { display: block; margin: 10px 0; }
            .detail-value { text-align: left; white-space: normal; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            ${generateEmailLogoMarkup()}
            <h1 class="email-title">${escapeHtml(title)}</h1>
            ${headerSubtitle ? `<p class="email-subtitle">${escapeHtml(headerSubtitle)}</p>` : ""}
        </div>
        <div class="email-body">
            ${content}
            ${ctaButton ? `<div style="text-align: center;"><a href="${escapeHtml(ctaButton.url)}" class="cta-button">${escapeHtml(ctaButton.text)}</a></div>` : ""}
        </div>
        <div class="email-footer">
            <p class="footer-text">Need help? We're here for you.</p>
            <div class="footer-links">
                <a href="mailto:${profile.supportEmail}">Contact Support</a>
            </div>
            ${preferencesBlock}
            <p class="company-info">
                © ${year} ${escapeHtml(EASNER_COMPANY_LEGAL_NAME)} All rights reserved.<br>
                ${EASNER_COMPANY_ADDRESS_HTML}<br>
                ${escapeHtml(accountNotice)}
            </p>
        </div>
    </div>
</body>
</html>
  `
}

export type SupabaseAuthEmailVariant = "password_reset" | "signup_verify"

const SUPABASE_AUTH_EMAIL_COPY: Record<
  SupabaseAuthEmailVariant,
  {
    title: string
    subtitle: string
    preheader: string
    intro: string
    note: string
    includeHelpLine: boolean
  }
> = {
  password_reset: {
    title: "Password reset",
    subtitle: "Use the code below to set a new password",
    preheader: "Your Easner password reset code",
    intro:
      "We received a request to reset the password for your Easner account. Enter the verification code below in the password reset screen.",
    note: "If you didn't request a password reset, you can safely ignore this email.",
    includeHelpLine: true,
  },
  signup_verify: {
    title: "Verify your email",
    subtitle: "Enter the code below to finish creating your account",
    preheader: "Your Easner verification code",
    intro: "Use this verification code to confirm your email and continue signing up for Easner.",
    note: "If you didn't request this code, you can safely ignore this email.",
    includeHelpLine: false,
  },
}

/** OTP block — paste `{{ .Token }}` verbatim into Supabase Auth email templates. */
export function generateAuthOtpBlock(tokenPlaceholder = "{{ .Token }}"): string {
  return `
        <div class="otp-container">
            <div class="otp-label">Your 6-digit verification code</div>
            <div class="otp-code">${tokenPlaceholder}</div>
            <div class="otp-help">This code expires in 10 minutes.</div>
        </div>
  `.trim()
}

/**
 * Full HTML for Supabase Auth (Confirm signup, Reset password, etc.).
 * Paste output into Supabase Dashboard → Authentication → Email Templates.
 */
export function generateSupabaseAuthEmailHtml(variant: SupabaseAuthEmailVariant): string {
  const copy = SUPABASE_AUTH_EMAIL_COPY[variant]
  const profile = getEmailAudienceProfile("personal")

  const content = `
        <p class="confirmation-text">${copy.intro}</p>
        ${generateAuthOtpBlock()}
        <div class="security-note"><p>${copy.note}</p></div>
        ${
          copy.includeHelpLine
            ? `<p class="confirmation-text">Need help? <a href="mailto:${profile.supportEmail}" style="color: ${emailTheme.primary}; text-decoration: none;">Contact support</a> and we'll take care of you.</p>`
            : ""
        }
  `.trim()

  return generateBaseEmailTemplate(copy.title, copy.subtitle, content, undefined, {
    audience: "personal",
    preheader: copy.preheader,
    showPreferencesLink: false,
    recipientHasEasnerAccount: variant !== "signup_verify",
  })
}

export type TransactionDetailRow = { label: string; value: string; isStatus?: boolean; statusClass?: string }

export function generateTransactionDetailsTable(
  rows: TransactionDetailRow[],
  heading = "Transaction details",
): string {
  const detailRows = rows
    .map((row) => {
      const valueHtml = row.isStatus
        ? `<span class="status-badge status-${row.statusClass ?? "completed"}">${escapeHtml(row.value)}</span>`
        : escapeHtml(row.value)
      return `<tr class="detail-row"><td class="detail-label">${escapeHtml(row.label)}</td><td class="detail-value" align="right">${valueHtml}</td></tr>`
    })
    .join("")

  return `
    <div class="transaction-details">
      <h3>${escapeHtml(heading)}</h3>
      <table class="transaction-details-table" role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tbody>
          ${detailRows}
        </tbody>
      </table>
    </div>
  `
}

/** @deprecated Use generateTransactionDetailsTable with ledger descriptor rows */
export function generateTransactionDetails(data: {
  transactionId: string
  recipientName?: string
  sendAmount?: number
  sendCurrency?: string
  receiveAmount?: number
  receiveCurrency?: string
  exchangeRate?: number
  fee?: number
  status?: string
  createdAt?: string
}): string {
  const rows: TransactionDetailRow[] = [
    { label: "Transaction ID", value: String(data.transactionId) },
  ]
  if (data.recipientName) rows.push({ label: "Recipient", value: data.recipientName })
  if (data.sendAmount != null && data.sendCurrency) {
    rows.push({ label: "Amount", value: `${data.sendAmount} ${data.sendCurrency}` })
  }
  if (data.receiveAmount != null && data.receiveCurrency) {
    rows.push({ label: "Receiving", value: `${data.receiveAmount} ${data.receiveCurrency}` })
  }
  if (data.status) {
    const st = data.status.toLowerCase()
    rows.push({
      label: "Status",
      value: st === "settled" ? "completed" : st,
      isStatus: true,
      statusClass: st === "settled" ? "completed" : st,
    })
  }
  if (data.createdAt) {
    rows.push({ label: "Date", value: new Date(data.createdAt).toLocaleDateString() })
  }
  return generateTransactionDetailsTable(rows)
}

export function generateFooter(): string {
  const profile = getEmailAudienceProfile("personal")
  const year = new Date().getFullYear()
  return `
    <p class="footer-text">Need help? We're here for you.</p>
    <div class="footer-links"><a href="mailto:${profile.supportEmail}">Contact Support</a></div>
    <p class="company-info">© ${year} ${EASNER_COMPANY_LEGAL_NAME} All rights reserved.<br>${EASNER_COMPANY_ADDRESS}</p>
  `
}

export { resolveEmailAudienceFromData, type EmailAudience }
