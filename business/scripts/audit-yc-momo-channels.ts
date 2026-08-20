/** YC channel types per visible mobile_money corridor */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { corridorHasRailCapability } from "../lib/admin/corridor-rail-capability"
import { annotateAdminCorridorsWithProviderHealth } from "../lib/admin/annotate-payout-corridors"
import { listYellowcardChannels } from "../lib/yellowcard/channels"

async function main() {
  const admin = createSupabaseAdmin()
  const channels = await listYellowcardChannels()
  const { data: rows } = await admin.from("payout_corridors").select("*").eq("rail", "mobile_money")
  const annotated = await annotateAdminCorridorsWithProviderHealth(rows ?? [])
  const visible = annotated.filter((r) => corridorHasRailCapability(r))

  console.log("Visible mobile_money corridors – YC channel breakdown:\n")
  for (const r of visible.sort((a, b) => a.country_name.localeCompare(b.country_name))) {
    const cc = r.country_code
    const cur = r.currency_code
    const yc = channels.filter(
      (c) =>
        String(c.country).toUpperCase() === cc &&
        String(c.currency).toUpperCase() === cur &&
        c.apiStatus === "active" &&
        c.status === "active",
    )
    const momo = yc.filter((c) => String(c.channelType ?? "").toLowerCase() === "momo")
    const other = yc.filter((c) => String(c.channelType ?? "").toLowerCase() !== "momo")
    console.log(
      `${r.country_name} (${cc}:${cur})`,
      `| YC momo ch: ${momo.length}`,
      momo.length ? momo.map((c) => `${c.channelType}/${c.rampType}`).join(", ") : "",
      other.length ? `| other YC: ${other.map((c) => `${c.channelType}/${c.rampType}`).join(", ")}` : "",
    )
  }
}

main().catch(console.error)
