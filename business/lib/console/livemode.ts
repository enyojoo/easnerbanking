export type ConsoleLivemode = "test" | "live"

export function parseConsoleLivemode(value: string | null | undefined): ConsoleLivemode {
  return value === "live" ? "live" : "test"
}
