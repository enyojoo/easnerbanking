/** Structured timing logs for Yellowcard integration diagnostics. */
export function logYcTiming(event: string, fields: Record<string, unknown> = {}): void {
  console.info("[yc-timing]", { event, ...fields })
}
