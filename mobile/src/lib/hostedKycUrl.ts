/**
 * Hosted KYC/KYB URLs for the Expo web iframe modal (same idea as Noah checkout).
 * Native iOS/Android keep the original URL and open it in Safari / Chrome Custom Tabs.
 */
export function hostedKycUrlForWebEmbed(link: string, iframeOrigin: string): string {
  try {
    const url = new URL(link)
    const host = url.hostname.toLowerCase()
    const origin = iframeOrigin.trim()
    const isPersona = host.includes('withpersona.com') || host.includes('persona.com')
    const isNoah = host.includes('noah.com')
    if (!isPersona && !isNoah) return link

    if (url.pathname.includes('/verify')) {
      url.pathname = url.pathname.replace('/verify', '/widget')
    }
    if (origin && !url.searchParams.has('iframe-origin')) {
      url.searchParams.set('iframe-origin', origin)
    }
    return url.toString()
  } catch {
    return link
  }
}
