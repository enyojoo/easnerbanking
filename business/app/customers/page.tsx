"use client"

import { Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PlatformCustomersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Customers</h1>
        <p className="mt-2 text-muted-foreground">
          Integration customers who pay through Checkout and payment APIs.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" />
            Coming next
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Customer records for Platform integrations will land here. Checkout and Developers are
          ready now.
        </CardContent>
      </Card>
    </div>
  )
}
