import { PlatformSendAuthorizePage } from "@/components/platform/platform-send-authorize-page"

export default async function SendAuthorizePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ client_secret?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  return <PlatformSendAuthorizePage transferId={id} clientSecret={query.client_secret ?? ""} />
}
