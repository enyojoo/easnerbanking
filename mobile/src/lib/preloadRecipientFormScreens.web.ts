/** Web uses React.lazy chunks; start them on Add press / type-sheet settle. */
let didType = false
let didRails = false

export function preloadRecipientTypeScreen(): void {
  if (didType) return
  didType = true
  void import('../screens/recipients/AddRecipientTypeScreen')
}

export function preloadRecipientFormRails(): void {
  if (didRails) return
  didRails = true
  void import('../screens/recipients/AddBankRecipientScreen')
  void import('../screens/recipients/AddMobileRecipientScreen')
  void import('../screens/recipients/AddWalletRecipientScreen')
  void import('../screens/recipients/AddEasenetRecipientScreen')
}
