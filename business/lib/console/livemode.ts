export type ConsoleLivemode = "test" | "live"

export function parseConsoleLivemode(value: string | null | undefined): ConsoleLivemode {
  return value === "live" ? "live" : "test"
}

export function consoleLivemodeQuery(livemode: ConsoleLivemode): string {
  return livemode === "live" ? "?livemode=live" : ""
}
