import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SendDestinationRow } from "./send-destination"

vi.mock("@/lib/noah/turnkey-offramp-orchestration", () => ({
  cryptoCurrencyForBalanceCurrency: vi.fn(() => "USDC"),
  executeTurnkeyOfframpPayout: vi.fn(),
}))
vi.mock("@/lib/noah/payout-quote", () => ({
  buildPayoutQuote: vi.fn(),
}))
vi.mock("@/lib/payout/confirm-payout-order", () => ({
  confirmPayoutOrder: vi.fn(),
}))
vi.mock("@/lib/grid/balance-payout-execute", () => ({
  executeGridBalancePayout: vi.fn(),
}))
vi.mock("@/lib/yellowcard/balance-payout-execute", () => ({
  executeYcBalancePayout: vi.fn(),
}))
vi.mock("@/lib/wallet-send/wallet-send-quote", () => ({
  buildWalletSendQuote: vi.fn(),
}))
vi.mock("@/lib/wallet-send/confirm-wallet-send-order", () => ({
  confirmWalletSendOrder: vi.fn(),
}))
vi.mock("@/lib/wallet-send/wallet-send-orchestration", () => ({
  executeWalletSend: vi.fn(),
}))
vi.mock("@/lib/wallet/resolve-wallet-owner", () => ({
  resolveTurnkeyAddressForNoahPair: vi.fn(),
}))
vi.mock("@/lib/wallet-send/routing", () => ({
  settlementAssetForBalance: vi.fn(() => "USDC"),
}))

import { executeGridBalancePayout } from "@/lib/grid/balance-payout-execute"
import { executeTurnkeyOfframpPayout } from "@/lib/noah/turnkey-offramp-orchestration"
import { executeWalletSend } from "@/lib/wallet-send/wallet-send-orchestration"
import { executeYcBalancePayout } from "@/lib/yellowcard/balance-payout-execute"
import { executeSendDestination } from "./send-destination-operations"

const bankDestination: SendDestinationRow = {
  id: "method-1",
  destinationRef: "payroll_method:method-1",
  type: "bank",
  full_name: "Amina Doe",
  country_code: "NG",
  currency: "NGN",
  account_number: "0123456789",
  bank_name: "Example Bank",
  phone_number: null,
  email: null,
  mobile_provider: null,
  wallet_network: null,
  routing_number: null,
  sort_code: null,
  iban: null,
  swift_bic: null,
  transfer_type: null,
  checking_or_savings: null,
  address_line1: null,
  city: null,
  state: null,
  postal_code: null,
  metadata: {},
}

const context = {
  admin: {} as never,
  accountContext: {} as never,
  userId: "business-owner",
  businessId: "business-1",
  sourceCurrency: "USD",
  noahCustomerId: "noah-business",
}

function input(provider: "noah" | "grid" | "yellowcard") {
  return {
    destination: bankDestination,
    amount: 1_000,
    amountEntryMode: "receive" as const,
    idempotencyKey: "payroll_line:line-1",
    locked: {
      lockId: "lock-1",
      sourceAmount: 1,
      payload: {
        kind: "fiat_payout",
        payoutProvider: provider,
        receiveAmount: 1_000,
        receiveCurrency: "NGN",
        countryCode: "NG",
        totalDebited: 1,
        customerPrincipal: 0.98,
        marginAmount: 0.01,
        processingFee: 0.01,
        channelCost: 0,
        formSessionId: "session-1",
        cryptoAuthorizedAmount: "1",
        gridQuoteId: "grid-quote",
        gridFundingAddress: "grid-wallet",
        gridCryptoAmount: 1,
        ycSequenceId: "yc-sequence",
        ycWalletAddress: "yc-wallet",
        ycCryptoAmount: 1,
      },
    },
  }
}

describe("executeSendDestination provider parity", () => {
  beforeEach(() => vi.clearAllMocks())

  it("passes a Payroll destination directly to Noah", async () => {
    vi.mocked(executeTurnkeyOfframpPayout).mockResolvedValue({
      ok: true,
      status: "pending",
      easnerTransactionId: "ETID-NOAH",
    } as never)
    const result = await executeSendDestination(context, input("noah"))
    expect(result).toEqual({ state: "submitted", transactionId: "ETID-NOAH" })
    expect(executeTurnkeyOfframpPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "business-owner",
        recipientRow: bankDestination,
        destinationRef: "payroll_method:method-1",
      }),
    )
  })

  it("passes the same destination contract to Grid", async () => {
    vi.mocked(executeGridBalancePayout).mockResolvedValue({
      ok: true,
      status: "pending",
      easnerTransactionId: "ETID-GRID",
    } as never)
    const result = await executeSendDestination(context, input("grid"))
    expect(result).toEqual({ state: "submitted", transactionId: "ETID-GRID" })
    expect(executeGridBalancePayout).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "business-owner",
        recipientRow: bankDestination,
        destinationRef: "payroll_method:method-1",
      }),
    )
  })

  it("passes the same destination contract to Yellowcard", async () => {
    vi.mocked(executeYcBalancePayout).mockResolvedValue({
      ok: true,
      status: "pending",
      easnerTransactionId: "ETID-YC",
    } as never)
    const result = await executeSendDestination(context, input("yellowcard"))
    expect(result).toEqual({ state: "submitted", transactionId: "ETID-YC" })
    expect(executeYcBalancePayout).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "business-owner",
        recipientRow: bankDestination,
        destinationRef: "payroll_method:method-1",
      }),
    )
  })

  it("uses the business-owned wallet session for wallet destinations", async () => {
    vi.mocked(executeWalletSend).mockResolvedValue({
      ok: true,
      status: "pending",
      easnerTransactionId: "ETID-WALLET",
    } as never)
    const walletDestination: SendDestinationRow = {
      ...bankDestination,
      type: "wallet",
      currency: "USDC",
      account_number: "wallet-address",
      wallet_network: "Solana",
    }
    const result = await executeSendDestination(context, {
      destination: walletDestination,
      amount: 10,
      amountEntryMode: "receive",
      idempotencyKey: "payroll_line:line-wallet",
      locked: {
        lockId: "wallet-session",
        sourceAmount: 10,
        payload: {
          kind: "wallet_send",
          formSessionId: "wallet-session",
        },
      },
    })
    expect(result).toEqual({
      state: "submitted",
      transactionId: "ETID-WALLET",
    })
    expect(executeWalletSend).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "business-owner",
        businessId: "business-1",
        destinationRef: "payroll_method:method-1",
      }),
    )
  })
})
