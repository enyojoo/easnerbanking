import type { Beneficiary } from "@/lib/recipient-types"
import {
  beneficiaryToPayoutSubtitleInput,
  formatPayoutRecipientSubtitle,
  getPayoutRecipientSubtitleParts,
} from "@easner/shared"

export { getPayoutRecipientSubtitleParts, formatPayoutRecipientSubtitle }

export function getBeneficiaryPayoutSubtitleParts(b: Beneficiary) {
  return getPayoutRecipientSubtitleParts(beneficiaryToPayoutSubtitleInput(b))
}

export function formatBeneficiaryPayoutSubtitle(b: Beneficiary): string {
  return formatPayoutRecipientSubtitle(beneficiaryToPayoutSubtitleInput(b))
}
