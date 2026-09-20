import { PlatformOnrampPage } from "@/components/platform/platform-onramp-page"

export default async function ReceiveOnrampPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PlatformOnrampPage sessionId={id} />
}
