import { redirect } from "next/navigation"

export default function CryptoRatesRedirectPage() {
  redirect("/platform-control?tab=crypto-rates")
}
