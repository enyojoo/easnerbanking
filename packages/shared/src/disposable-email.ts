/**
 * Shared disposable / throwaway email-domain blocklist.
 *
 * Used to reject sign-ups from temporary-mailbox providers (the kind automated bots use because
 * the inbox auto-confirms OTP). Enforced server-side at sign-up pre-check + bootstrap, and surfaced
 * client-side for early UX. Keep the list lowercase and sorted; add new abusive domains as observed.
 */

/** Known disposable / temp-mail domains. Lowercase, no leading dot. */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "0clock.net",
  "0wnd.net",
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "anonbox.net",
  "burnermail.io",
  "cock.li",
  "dispostable.com",
  "dropmail.me",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "harakirimail.com",
  "inboxbear.com",
  "inboxkitten.com",
  "mailinator.com",
  "mailnesia.com",
  "maildrop.cc",
  "mailsac.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "temp-mail.org",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "tosagree.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.net",
  "zetmail.com",
])

/** Lowercased domain of an email, or `null` if it isn't a parseable `local@domain`. */
export function emailDomain(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null
  const at = email.lastIndexOf("@")
  if (at <= 0 || at === email.length - 1) return null
  return email.slice(at + 1).trim().toLowerCase() || null
}

/** True when the email's domain is a known disposable / throwaway provider. */
export function isDisposableEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email)
  return domain != null && DISPOSABLE_EMAIL_DOMAINS.has(domain)
}
