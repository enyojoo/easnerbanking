export function sanitizePayStubLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return normalized || "recipient"
}

export function resolvePayStubFilename(input: {
  easetag?: string | null
  fullName?: string | null
  reversal?: boolean
}): string {
  const firstName = String(input.fullName ?? "").trim().split(/\s+/)[0]
  const label = sanitizePayStubLabel(input.easetag || firstName)
  return `pay-stub-${label}${input.reversal ? "-reversal" : ""}.pdf`
}

export function resolvePayStubStoragePath(input: {
  businessId: string
  runId: string
  lineId: string
  filename: string
}): string {
  const ids = [input.businessId, input.runId, input.lineId]
  if (ids.some((id) => !/^[a-zA-Z0-9-]+$/.test(id))) {
    throw new Error("Invalid payroll document path")
  }
  if (!/^pay-stub-[a-z0-9-]+(?:-reversal)?\.pdf$/.test(input.filename)) {
    throw new Error("Invalid payroll document filename")
  }
  return `${input.businessId}/${input.runId}/${input.lineId}/${input.filename}`
}
