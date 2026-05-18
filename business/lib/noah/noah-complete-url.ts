/** True when Noah hosted onboarding navigated to our completion ReturnURL. */
export function isNoahCompleteUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "")
    return path === "/auth/noah-complete"
  } catch {
    return url.includes("/auth/noah-complete")
  }
}
