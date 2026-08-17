"use client"

import { Card, CardContent } from "@/components/ui/card"

export default function CheckoutPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-4 border-b bg-background pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Online Checkout</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect your website — allowlisted origins, API keys, embed snippet, server examples, and webhooks. Customers
            pay on your site; this page is the integration hub, not a hosted checkout builder.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Setup checklist (online payments ready, website origins, return URLs, keys, snippet, webhook, test preview)
          ships here next. Complete verification in Settings if card payments are not enabled yet. Payment Links for
          no-code URLs live under Collections → Links.
        </CardContent>
      </Card>
    </div>
  )
}
