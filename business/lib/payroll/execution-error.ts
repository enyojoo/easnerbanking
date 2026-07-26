const SENSITIVE_VALUE_PATTERN =
  /\b(?:\+?\d[\d\s().-]{6,}\d|0x[a-fA-F0-9]{12,}|[1-9A-HJ-NP-Za-km-z]{24,}|[A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/g

export function sanitizePayrollExecutionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "")
  const singleLine = raw.replace(/\s+/g, " ").trim()
  if (!singleLine) return "Payroll execution failed."
  return singleLine.replace(SENSITIVE_VALUE_PATTERN, "[redacted]").slice(0, 300)
}
