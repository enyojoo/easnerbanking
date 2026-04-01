import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { getStrategyRuntimeConfig } from "@/lib/pricing/strategy-config"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const runtime = getStrategyRuntimeConfig()
  return NextResponse.json({
    ok: true,
    runtime,
    rollback: {
      enabled: runtime.legacyMode,
      switch: "PRICING_ENGINE_LEGACY_MODE",
    },
    rollout: {
      shadowMode: runtime.shadowMode,
      canaryPercent: runtime.canaryPercent,
      canarySwitch: "PRICING_ENGINE_CANARY_PERCENT",
    },
  })
}
