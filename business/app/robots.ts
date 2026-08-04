import type { MetadataRoute } from "next"

/** Business app is private product surface – disallow all crawlers. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  }
}
