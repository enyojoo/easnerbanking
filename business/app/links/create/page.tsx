import { PaymentLinksPage } from "@/components/links/payment-links-page"

/** Deep link into the create flow with the stablecoin rail preselected (former placard create). */
export default function LinksCreatePage() {
  return <PaymentLinksPage initialCreateRail="stablecoin" />
}
