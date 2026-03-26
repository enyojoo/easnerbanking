"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { LayoutDashboard, Smartphone } from "lucide-react"

/** Universal link / app link target — aligns with `mobile` `DeepLinkService` (`/user/dashboard` on easner.com). */
const DEFAULT_MOBILE_HOME = "https://easner.com/user/dashboard"

export type NoahReturnVariant = "kyc" | "kyb"

export function NoahReturnView({ variant }: { variant: NoahReturnVariant }) {
  const mobileHome =
    typeof process.env.NEXT_PUBLIC_MOBILE_APP_HOME_URL === "string" &&
    process.env.NEXT_PUBLIC_MOBILE_APP_HOME_URL.length > 0
      ? process.env.NEXT_PUBLIC_MOBILE_APP_HOME_URL.replace(/\/$/, "")
      : DEFAULT_MOBILE_HOME

  const title =
    variant === "kyc" ? "Identity verification complete" : "Business verification complete"

  const description =
    variant === "kyc"
      ? "Your Noah verification step is finished. Return to the Easner app to continue. If the app does not open, use the button below."
      : "Your business verification step is finished. Continue in the Easner app or open your Easner Business dashboard."

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">{title}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full h-11 gap-2" asChild>
          <a href={mobileHome}>
            <Smartphone className="h-4 w-4" aria-hidden />
            Open Easner app
          </a>
        </Button>
        <Button variant="outline" className="w-full h-11 gap-2" asChild>
          <Link href="/dashboard">
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            Continue in browser
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground pt-2">
          If you are not logged in on the web, you may be asked to sign in before the dashboard loads.
        </p>
      </CardContent>
    </Card>
  )
}
