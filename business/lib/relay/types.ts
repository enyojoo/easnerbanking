export type RelayTradeType = "EXACT_INPUT" | "EXACT_OUTPUT" | "EXPECTED_OUTPUT"

export type RelayQuoteV2Request = {
  user: string
  originChainId: number
  destinationChainId: number
  originCurrency: string
  destinationCurrency: string
  amount: string
  tradeType: RelayTradeType
  recipient: string
  useDepositAddress?: boolean
  subsidizeFees?: boolean
  maxSubsidizationAmount?: string
  slippageTolerance?: string
  referrer?: string
}

export type RelayCurrencyAmount = {
  currency?: {
    chainId?: number
    address?: string
    symbol?: string
    decimals?: number
  }
  amount?: string
  amountFormatted?: string
  amountUsd?: string
  minimumAmount?: string
}

export type RelayQuoteV2Response = {
  steps?: Array<{
    id?: string
    requestId?: string
    items?: Array<{
      status?: string
      data?: Record<string, unknown>
      check?: { endpoint?: string; method?: string }
    }>
  }>
  fees?: Record<string, unknown>
  details?: {
    currencyIn?: RelayCurrencyAmount
    currencyOut?: RelayCurrencyAmount
    route?: Record<string, unknown>
  }
  /** Some responses include request id at top level. */
  requestId?: string
  id?: string
}

export type RelayRequestV3Status =
  | "pending"
  | "waiting"
  | "depositing"
  | "submitted"
  | "success"
  | "failure"
  | "refund"

export type RelayRequestV3 = {
  id: string
  status: RelayRequestV3Status | string
  user?: string
  sender?: string
  recipient?: string
  depositAddress?: {
    address?: string
    type?: string
    depositor?: string
    depositTxHash?: string
    recoveryAddress?: string
  } | null
  requestType?: string
  data?: Record<string, unknown>
  protocol?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export type RelayRequestsV3ListResponse = {
  requests?: RelayRequestV3[]
  continuation?: string | null
  total?: number
}
