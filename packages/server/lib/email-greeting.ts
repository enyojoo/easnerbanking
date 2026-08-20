/** Shared "Hey {firstName}," greeting for Easner account-holder emails. */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Plain-text greeting – `Hey Sam,` or `Hey there,` when name is unknown. */
export function formatEasnerUserGreetingPlain(firstName?: string | null): string {
  const name = String(firstName ?? "").trim()
  return name ? `Hey ${name},` : "Hey there,"
}

/** HTML-safe greeting line (no wrapper element). */
export function formatEasnerUserGreetingHtml(firstName?: string | null): string {
  const name = String(firstName ?? "").trim()
  return name ? `Hey ${escapeHtml(name)},` : "Hey there,"
}

export function easnerUserGreetingParagraphHtml(firstName?: string | null): string {
  return `<p class="welcome-text">${formatEasnerUserGreetingHtml(firstName)}</p>`
}

/** External invoice customers – keep formal `Dear {name},`. */
export function customerGreetingParagraphHtml(customerName: string): string {
  const name = String(customerName ?? "").trim() || "Customer"
  return `<p class="welcome-text">Dear ${escapeHtml(name)},</p>`
}

export function formatCustomerGreetingPlain(customerName: string): string {
  const name = String(customerName ?? "").trim() || "Customer"
  return `Dear ${name},`
}
