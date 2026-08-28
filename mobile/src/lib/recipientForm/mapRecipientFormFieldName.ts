/** Map snake_case config field names to camelCase form keys. */
export function mapRecipientFormFieldName(fieldName: string): string {
  const fieldMap: Record<string, string> = {
    account_name: 'fullName',
    routing_number: 'routingNumber',
    account_number: 'accountNumber',
    bank_name: 'bankName',
    sort_code: 'sortCode',
    iban: 'iban',
    swift_bic: 'swiftBic',
  }
  return fieldMap[fieldName] || fieldName
}
