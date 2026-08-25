import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetLatestBlockhash = vi.fn()
const mockGetAddressLookupTable = vi.fn()

vi.mock("@solana/web3.js", () => {
  class PublicKey {
    constructor(public key: string) {}
    toString() {
      return this.key
    }
    static default = new PublicKey("11111111111111111111111111111111")
  }

  class TransactionInstruction {
    programId: PublicKey
    keys: unknown[]
    data: Buffer
    constructor(input: { programId: PublicKey; keys: unknown[]; data: Buffer }) {
      this.programId = input.programId
      this.keys = input.keys
      this.data = input.data
    }
  }

  class TransactionMessage {
    payerKey: PublicKey
    recentBlockhash: string
    instructions: TransactionInstruction[]
    constructor(input: {
      payerKey: PublicKey
      recentBlockhash: string
      instructions: TransactionInstruction[]
    }) {
      this.payerKey = input.payerKey
      this.recentBlockhash = input.recentBlockhash
      this.instructions = input.instructions
    }
    compileToV0Message(lookupTables: unknown[]) {
      return { lookupTables, instructions: this.instructions, payer: this.payerKey.toString() }
    }
  }

  class VersionedTransaction {
    message: unknown
    constructor(message: unknown) {
      this.message = message
    }
    serialize() {
      return Buffer.from("compiled-relay-tx")
    }
  }

  class Connection {
    constructor(_url: string, _commitment: string) {}
    getLatestBlockhash = mockGetLatestBlockhash
    getAddressLookupTable = mockGetAddressLookupTable
  }

  class AddressLookupTableAccount {}

  return {
    AddressLookupTableAccount,
    Connection,
    PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
  }
})

import {
  compileRelaySolanaStepTxHexForTurnkey,
  extractPreSerializedRelaySolanaTxHex,
} from "../compile-solana-step-tx"
import { extractRelaySolanaUnsignedTx, resolveRelaySolanaUnsignedTxHexForTurnkey } from "../quote"

describe("compileRelaySolanaStepTxHexForTurnkey", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLatestBlockhash.mockResolvedValue({ blockhash: "blockhash-1" })
    mockGetAddressLookupTable.mockResolvedValue({ value: { key: "lut-1" } })
  })

  it("returns normalized hex for pre-serialized wire bytes", async () => {
    const raw = Buffer.from("deadbeef", "hex")
    const hex = await compileRelaySolanaStepTxHexForTurnkey({
      stepData: { data: raw.toString("hex") },
      feePayer: "vault-1",
    })
    expect(hex).toBe("deadbeef")
  })

  it("compiles instruction + lookup-table steps into hex", async () => {
    const hex = await compileRelaySolanaStepTxHexForTurnkey({
      stepData: {
        instructions: [
          {
            programId: "99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2",
            keys: [{ pubkey: "vault-1", isSigner: true, isWritable: true }],
            data: "010203",
          },
        ],
        addressLookupTableAddresses: ["Hm9fUgcn7qwDaiNTFiGh6pNtVATgnaRcmK6Bbx6EMZfP"],
      },
      feePayer: "vault-1",
    })

    expect(hex).toBe(Buffer.from("compiled-relay-tx").toString("hex"))
    expect(mockGetAddressLookupTable).toHaveBeenCalledTimes(1)
    expect(mockGetLatestBlockhash).toHaveBeenCalledTimes(1)
  })
})

describe("extractRelaySolanaUnsignedTx", () => {
  it("reads legacy pre-serialized step data", () => {
    expect(
      extractRelaySolanaUnsignedTx({
        steps: [{ items: [{ data: { data: "abc123" } }] }],
      }),
    ).toBe("abc123")
  })

  it("throws when only instruction steps are present", () => {
    expect(() =>
      extractRelaySolanaUnsignedTx({
        steps: [{ items: [{ data: { instructions: [{ programId: "prog", data: "01" }] } }] }],
      }),
    ).toThrow("relay_missing_solana_transaction")
  })
})

describe("resolveRelaySolanaUnsignedTxHexForTurnkey", () => {
  beforeEach(() => {
    mockGetLatestBlockhash.mockResolvedValue({ blockhash: "blockhash-1" })
    mockGetAddressLookupTable.mockResolvedValue({ value: { key: "lut-1" } })
  })

  it("compiles instruction steps for Turnkey", async () => {
    const hex = await resolveRelaySolanaUnsignedTxHexForTurnkey({
      quote: {
        steps: [
          {
            items: [
              {
                data: {
                  instructions: [{ programId: "prog", keys: [], data: "01" }],
                  addressLookupTableAddresses: [],
                },
              },
            ],
          },
        ],
      },
      feePayer: "vault-1",
    })
    expect(hex).toBe(Buffer.from("compiled-relay-tx").toString("hex"))
  })
})

describe("extractPreSerializedRelaySolanaTxHex", () => {
  it("accepts base64 wire bytes", () => {
    const raw = Buffer.from([1, 2, 3, 4])
    expect(extractPreSerializedRelaySolanaTxHex({ data: raw.toString("base64") })).toBe("01020304")
  })
})
