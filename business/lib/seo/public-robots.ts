import type { MetadataRoute } from "next"
import { isCustomerAppHostname } from "@/lib/customer-hosts"

/**
 * Operator dashboard stays closed to crawlers. Pay/invoice hosts must allow
 * fetches or iMessage/Slack/WhatsApp skip `og:image`.
 */
export function publicRobotsForHostname(hostname: string | null | undefined): MetadataRoute.Robots {
  if (isCustomerAppHostname(hostname)) {
    return {
      rules: {
        userAgent: "*",
        allow: "/",
      },
    }
  }

  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  }
}
