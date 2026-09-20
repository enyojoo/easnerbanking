"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAppSurface } from "@/lib/use-app-surface"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const surface = useAppSurface()
  const homeHref = surface === "platform" ? "/console" : "/dashboard"

  useEffect(() => {
    console.error("[business] error boundary:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Error</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This screen failed to load. Try again, or go back to {surface === "platform" ? "Console" : "Home"}.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href={homeHref}>{surface === "platform" ? "Back to Console" : "Back to Home"}</Link>
        </Button>
      </div>
    </div>
  )
}
