import { describe, expect, it } from "vitest"
import {
  SETTINGS_VERIFICATION_HREF,
  SETTINGS_BRIDGE_FLOW_HREF,
  SETTINGS_NG_LOCAL_FLOW_HREF,
} from "./cutover-comms"

describe("cutover settings links", () => {
  it("keeps verification deep links on Settings", () => {
    expect(SETTINGS_VERIFICATION_HREF).toBe("/settings?tab=verification")
    expect(SETTINGS_BRIDGE_FLOW_HREF).toContain("flow=bridge")
  })

  it("points nigeria local setup at settings verification flow", () => {
    expect(SETTINGS_NG_LOCAL_FLOW_HREF).toContain("flow=ng_local")
    expect(SETTINGS_NG_LOCAL_FLOW_HREF).toContain("tab=verification")
  })
})
