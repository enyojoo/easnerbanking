import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"

/** Fire-and-forget YC channel/network cache warm after instant Continue navigation. */
export function warmYcMetadataCacheOnContinue(input?: { country?: string; currency?: string }): void {
  void listYellowcardChannels().catch(() => {})
  const country = input?.country?.trim().toUpperCase()
  if (country) {
    void listYellowcardNetworks({ country, currency: input?.currency?.trim().toUpperCase() }).catch(
      () => {},
    )
  }
}
