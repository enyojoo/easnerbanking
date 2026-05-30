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
}
