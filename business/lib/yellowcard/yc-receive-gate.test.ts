import { describe, expect, it } from "vitest"
import {
  corridorLocalPayInEnabled,
  corridorSupportsLocalPayIn,
  corridorSupportsNoahReceive,
  corridorSupportsYcReceive,
  corridorYcReceiveEnabled,
} from "./yc-receive-gate"

describe("yc-receive-gate", () => {
  it("treats yc_receive as provider support independent of office toggle", () => {
    expect(corridorSupportsYcReceive({ yc_receive: true, yc_receive_enabled: false })).toBe(true)
    expect(corridorSupportsYcReceive({ yc_receive: true, yc_receive_enabled: true })).toBe(true)
    expect(corridorSupportsYcReceive({ yc_receive_enabled: true })).toBe(false)
    expect(corridorSupportsYcReceive({ yc_receive: false, yc_receive_enabled: true })).toBe(false)
  })

  it("reads office local pay-in toggle separately", () => {
    expect(corridorYcReceiveEnabled({ yc_receive_enabled: true })).toBe(true)
    expect(corridorYcReceiveEnabled({ yc_receive: true, yc_receive_enabled: false })).toBe(false)
  })

  it("aggregates local pay-in support and toggles across providers", () => {
    expect(corridorSupportsNoahReceive({ noah_receive: true })).toBe(true)
    expect(corridorSupportsLocalPayIn({ yc_receive: true })).toBe(true)
    expect(corridorSupportsLocalPayIn({ noah_receive: true })).toBe(true)
    expect(corridorSupportsLocalPayIn({})).toBe(false)
    expect(corridorLocalPayInEnabled({ yc_receive: true, yc_receive_enabled: true })).toBe(true)
    expect(corridorLocalPayInEnabled({ noah_receive: true, noah_receive_enabled: true })).toBe(true)
    expect(corridorLocalPayInEnabled({ yc_receive: true, yc_receive_enabled: false })).toBe(false)
  })
})
