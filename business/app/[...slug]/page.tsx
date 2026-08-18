import { headers } from "next/headers"
import { CustomerPublicView } from "@/components/customer-host/customer-public-view"
import { pickPublicHostname } from "@/lib/customer-hosts"

export const dynamic = "force-dynamic"

export default async function PublicCatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const headerList = await headers()
  const hostname = pickPublicHostname(headerList.get("x-forwarded-host"), headerList.get("host"))

  return <CustomerPublicView parts={slug} hostname={hostname} />
}
