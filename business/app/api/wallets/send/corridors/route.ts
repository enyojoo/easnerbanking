import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isWalletSendEnabled } from "@/lib/relay/config"
import {
  getWalletSendIconManifest,
  tokenIconFromManifest,
  networkIconFromManifest,
} from "@/lib/wallet-send/icon-manifest"
import { listWalletSendCorridors } from "@/lib/wallet-send/corridors"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  if (!isWalletSendEnabled()) {
    return NextResponse.json({ enabled: false, corridors: [] })
  }

  const manifest = await getWalletSendIconManifest()
  const corridors = listWalletSendCorridors().map((c) => ({
    ...c,
    tokenIconUrl: tokenIconFromManifest(manifest, c.asset, c.network),
    networkIconUrl: networkIconFromManifest(manifest, c.network),
  }))

  return NextResponse.json({ enabled: true, corridors, manifestUpdatedAt: manifest.updatedAt })
}
