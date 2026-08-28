import { mapCadRoutingToGridMetadata, normalizeRecipientYcMetadata } from '@easner/shared'
import type { RecipientFormValues } from './recipientFormTypes'

export function buildRecipientYcMetadata(
  values: RecipientFormValues,
  countryCode?: string,
): ReturnType<typeof normalizeRecipientYcMetadata> {
  const extras = normalizeRecipientYcMetadata({
    pix_key_type: values.ycPixKeyType,
    tax_id: values.ycTaxId,
    cuit: values.ycCuit,
    identification_type: values.ycIdentificationType,
    identification_number: values.ycIdentificationNumber,
    account_type: values.ycAccountType,
    ifsc: values.ycIfsc,
    bank_code: values.ycBankCode,
    branch_code: values.ycBranchCode,
    grid_region: values.ycGridRegion,
  })
  if (countryCode === 'CA' && String(values.currency || '').toUpperCase() === 'CAD') {
    return mapCadRoutingToGridMetadata({
      routingNumber: values.routingNumber,
      sortCode: values.sortCode,
      metadata: extras,
    })
  }
  return extras
}
