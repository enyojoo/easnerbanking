"use client"

import { useParams } from "next/navigation"
import { StablecoinChargePanel } from "@/components/pay/stablecoin-charge-panel"

export default function PayChargePage() {
  const params = useParams()
  const sessionId = String(params.sessionId || "")

  return <StablecoinChargePanel sessionId={sessionId} variant="counter" amountLabel="Invoice total" />
}
