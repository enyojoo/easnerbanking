import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { pickPublicHostname } from "@/lib/customer-hosts"
import { publicRobotsForHostname } from "@/lib/seo/public-robots"

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerList = await headers()
  const hostname = pickPublicHostname(headerList.get("x-forwarded-host"), headerList.get("host"))
  return publicRobotsForHostname(hostname)
}
