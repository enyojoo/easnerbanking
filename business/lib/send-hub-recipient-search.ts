import type { Beneficiary } from "@/lib/recipient-types"

/**
 * Parity with mobile `filterRecipientsBySearch`:
 * - No leading `@`: substring match on name, bank, account, IBAN, easetag.
 * - Leading `@`: handle mode — progressive match on tag / display name for saved recipients.
 */
export function filterBeneficiariesBySearch(beneficiaries: Beneficiary[], searchTerm: string): Beneficiary[] {
  const trimmed = searchTerm.trim()
  if (!trimmed) return beneficiaries

  const isAtMode = trimmed.startsWith("@")
  const handleQuery = isAtMode ? trimmed.replace(/^@+/, "").toLowerCase() : ""
  const q = trimmed.toLowerCase()

  return beneficiaries.filter((b) => {
    if (isAtMode) {
      if (!handleQuery) return true
      const tag = (b.payeeEasetag || "").trim().toLowerCase()
      const name = (b.name || "").trim().toLowerCase()
      return (
        tag.startsWith(handleQuery) ||
        tag.includes(handleQuery) ||
        name.includes(handleQuery) ||
        (`@${tag}`.includes(handleQuery) && tag.length > 0)
      )
    }

    const hay = [
      b.name,
      b.bankName,
      b.payeeEasetag || "",
      b.payeeEasetag ? `@${b.payeeEasetag}` : "",
      b.accountNumber,
      b.fullAccountNumber,
      b.iban || "",
    ]
      .join(" ")
      .toLowerCase()
    return hay.includes(q)
  })
}
