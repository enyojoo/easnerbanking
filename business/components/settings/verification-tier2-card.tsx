"use client"

import { CreditCard } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"

const tier2 = BUSINESS_TIER_LADDER.tiers.find((t) => t.tier === 2)

export function VerificationTier2Card() {
  if (!tier2) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base">{tier2.title}</CardTitle>
          <Badge variant="outline" className="text-xs">
            Tier 2
          </Badge>
          <Badge variant="secondary" className="text-xs">
            Coming later
          </Badge>
        </div>
        <CardDescription className="text-sm">{tier2.description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
