"use client"

import type React from "react"
import { PayShell } from "@/components/pay-shell"
import { PayAuthGate } from "@/components/pay/pay-auth-gate"

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <PayShell>
      <PayAuthGate>{children}</PayAuthGate>
    </PayShell>
  )
}
