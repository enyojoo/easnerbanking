"use client"

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  getAppSurface,
  isForcedPlatformSurface,
  resolveAppSurface,
  type ProductSurface,
} from "@/lib/app-surface"
import {
  clearAppSurfaceCookie,
  readAppSurfaceCookieFromDocument,
  writeAppSurfaceCookie,
} from "@/lib/app-surface-cookie"
import { isPublicSurfacePath } from "@/lib/surface-paths"
import { useBusinessProfile } from "@/lib/use-business-profile"

type AppSurfaceContextValue = {
  surface: ProductSurface
  setSurface: (surface: ProductSurface) => void
  applyStoredSurface: () => ProductSurface
}

const AppSurfaceContext = createContext<AppSurfaceContextValue | null>(null)

export function AppSurfaceProvider({ children }: { children: ReactNode }) {
  const [surface, setSurfaceState] = useState<ProductSurface>(() => getAppSurface())
  const { hasData, devPlatformEnabled } = useBusinessProfile()

  const applyStoredSurface = useCallback((): ProductSurface => {
    if (typeof window === "undefined") return getAppSurface()
    if (isPublicSurfacePath(window.location.pathname, window.location.hostname)) {
      const next = getAppSurface()
      setSurfaceState(next)
      return next
    }
    const next = resolveAppSurface({
      hostname: window.location.hostname,
      cookie: readAppSurfaceCookieFromDocument(document.cookie),
    })
    setSurfaceState(next)
    return next
  }, [])

  const setSurface = useCallback((next: ProductSurface) => {
    writeAppSurfaceCookie(next)
    setSurfaceState(next)
  }, [])

  const hostname = typeof window === "undefined" ? null : window.location.hostname
  const blocked =
    hasData &&
    devPlatformEnabled === false &&
    surface === "platform" &&
    !isForcedPlatformSurface(hostname)

  useLayoutEffect(() => {
    if (!blocked) return
    clearAppSurfaceCookie()
    setSurfaceState("business")
  }, [blocked])

  const effective: ProductSurface = blocked ? "business" : surface

  const value = useMemo(
    () => ({ surface: effective, setSurface, applyStoredSurface }),
    [effective, setSurface, applyStoredSurface],
  )

  return <AppSurfaceContext.Provider value={value}>{children}</AppSurfaceContext.Provider>
}

export function useAppSurfaceContext(): AppSurfaceContextValue | null {
  return useContext(AppSurfaceContext)
}
