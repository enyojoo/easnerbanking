import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { AppSurface } from "@/lib/auth/app-surface-access"
import { applyCorsHeaders, corsPreflightResponse, getCorsAllowedOrigins } from "@/lib/cors"
import {
  accessForSurface,
  platformMaintenanceMessage,
  readPlatformAccess,
  registrationClosedMessage,
} from "@/lib/platform-access"

export const runtime = "nodejs"

const SURFACES: AppSurface[] = ["business_web", "consumer_mobile"]

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store")
  return response
}

export async function OPTIONS(request: NextRequest) {
  const allowed = getCorsAllowedOrigins()
  const preflight = corsPreflightResponse(request, allowed)
  if (preflight) {
    preflight.headers.set("Cache-Control", "no-store")
    return preflight
  }
  return noStore(new NextResponse(null, { status: 204 }))
}

export async function GET(request: NextRequest) {
  const allowed = getCorsAllowedOrigins()
  const preflight = corsPreflightResponse(request, allowed)
  if (preflight) return noStore(preflight)

  const surfaceRaw = new URL(request.url).searchParams.get("surface")?.trim() ?? ""
  const surface = SURFACES.includes(surfaceRaw as AppSurface) ? (surfaceRaw as AppSurface) : null
  if (!surface) {
    return noStore(
      applyCorsHeaders(
        NextResponse.json({ error: "surface required (business_web|consumer_mobile)" }, { status: 400 }),
        request,
        allowed,
      ),
    )
  }

  const admin = createSupabaseAdmin()
  const flags = accessForSurface(await readPlatformAccess(admin), surface)
  return noStore(
    applyCorsHeaders(
      NextResponse.json({
        surface,
        maintenance: flags.maintenance,
        registration: flags.registration,
        maintenanceMessage: platformMaintenanceMessage(surface),
        registrationMessage: registrationClosedMessage(surface),
      }),
      request,
      allowed,
    ),
  )
}
