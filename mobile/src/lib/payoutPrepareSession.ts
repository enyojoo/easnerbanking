export type PayoutPrepareSession = {
  recipientId: string
  formSessionId: string
  cryptoAuthorizedAmount: string
  cryptoCurrency: string
  channelId?: string
  noahFloor?: string
  noahSendAmount?: string
  totalDebited?: string
  marginAmount?: string
  marginCaptureMode?: 'surplus_send' | 'split_debit'
  customerRate?: number
  noahMid?: number
  payoutProvider?: 'noah' | 'yellowcard' | 'grid'
  ycSequenceId?: string
  ycSendId?: string
  ycWalletAddress?: string
  ycCryptoAmount?: number
  gridQuoteId?: string
  gridSequenceId?: string
  gridCustomerId?: string
  gridExternalAccountId?: string
  gridCryptoAmount?: number
  gridFundingAddress?: string
  lockId?: string
}
