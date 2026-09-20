"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAppSurface } from "@/lib/use-app-surface"

export default function NotFound() {
  const surface = useAppSurface()
  const homeHref = surface === "platform" ? "/console" : "/dashboard"
  const homeLabel = surface === "platform" ? "Back to Console" : "Back to Home"

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">This page isn’t here</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The link may be out of date, or this screen has not been built yet.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={surface === "platform" ? "/dashboard" : "/console"}>
            {surface === "platform" ? "Banking Home" : "Dev Console"}
          </Link>
        </Button>
      </div>
    </div>
  )
}
