import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js"
import { getSolanaRpcUrl } from "@/lib/turnkey/sol-spl-transfer-unsigned-tx"

type RelaySolanaInstructionKey = {
  pubkey: string
  isSigner?: boolean
  isWritable?: boolean
}

type RelaySolanaInstruction = {
  programId: string
  keys?: RelaySolanaInstructionKey[]
  data?: string
}

export type RelaySolanaStepData = {
  instructions?: RelaySolanaInstruction[]
  addressLookupTableAddresses?: string[]
  data?: string
  transaction?: string
  unsignedTransaction?: string
  serializedTransaction?: string
}

function decodeInstructionData(raw: string): Buffer {
  const trimmed = String(raw || "").trim()
  if (!trimmed) return Buffer.alloc(0)
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    return Buffer.from(hex, "hex")
  }
  return Buffer.from(trimmed, "base64")
}

function normalizePreSerializedRelaySolanaTx(raw: string): string {
  const trimmed = String(raw || "").trim()
  if (!trimmed) throw new Error("relay_missing_solana_transaction")

  const hexCandidate = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed
  if (/^[0-9a-fA-F]+$/.test(hexCandidate) && hexCandidate.length >= 2) {
    return hexCandidate.toLowerCase()
  }

  const bytes = Buffer.from(trimmed, "base64")
  if (bytes.length === 0) throw new Error("relay_missing_solana_transaction")
  return bytes.toString("hex")
}

function parseRelayInstructions(data: RelaySolanaStepData): TransactionInstruction[] {
  const instructions = data.instructions ?? []
  if (instructions.length === 0) throw new Error("relay_missing_solana_transaction")

  return instructions.map((ix) => {
    const programId = String(ix.programId || "").trim()
    if (!programId) throw new Error("relay_missing_solana_transaction")
    return new TransactionInstruction({
      programId: new PublicKey(programId),
      keys: (ix.keys ?? []).map((key) => ({
        pubkey: new PublicKey(String(key.pubkey || "").trim()),
        isSigner: Boolean(key.isSigner),
        isWritable: Boolean(key.isWritable),
      })),
      data: decodeInstructionData(String(ix.data ?? "")),
    })
  })
}

async function fetchLookupTableAccounts(
  connection: Connection,
  addresses: string[],
): Promise<AddressLookupTableAccount[]> {
  const out: AddressLookupTableAccount[] = []
  for (const addr of addresses) {
    const key = String(addr || "").trim()
    if (!key) continue
    const res = await connection.getAddressLookupTable(new PublicKey(key))
    if (!res.value) throw new Error(`relay_lut_not_found:${key}`)
    out.push(res.value)
  }
  return out
}

export function extractPreSerializedRelaySolanaTxHex(data: RelaySolanaStepData): string | null {
  const direct = String(
    data.data ?? data.transaction ?? data.unsignedTransaction ?? data.serializedTransaction ?? "",
  ).trim()
  if (direct) return normalizePreSerializedRelaySolanaTx(direct)

  const serialized = String(data.serializedTransaction ?? "").trim()
  if (serialized && Array.isArray(data.instructions) && data.instructions.length > 0) {
    return normalizePreSerializedRelaySolanaTx(serialized)
  }

  return null
}

export async function compileRelaySolanaStepTxHexForTurnkey(input: {
  stepData: RelaySolanaStepData
  feePayer: string
  recentBlockhash?: string
  rpcUrl?: string
}): Promise<string> {
  const preSerialized = extractPreSerializedRelaySolanaTxHex(input.stepData)
  if (preSerialized) return preSerialized

  const feePayer = String(input.feePayer || "").trim()
  if (!feePayer) throw new Error("relay_missing_solana_fee_payer")

  const instructions = parseRelayInstructions(input.stepData)
  const lookupAddresses = (input.stepData.addressLookupTableAddresses ?? [])
    .map((addr) => String(addr || "").trim())
    .filter(Boolean)

  const connection = new Connection(input.rpcUrl || getSolanaRpcUrl(), "confirmed")
  const lookupTableAccounts = lookupAddresses.length
    ? await fetchLookupTableAccounts(connection, lookupAddresses)
    : []

  const recentBlockhash =
    String(input.recentBlockhash || "").trim() ||
    (await connection.getLatestBlockhash("finalized")).blockhash

  const message = new TransactionMessage({
    payerKey: new PublicKey(feePayer),
    recentBlockhash,
    instructions,
  }).compileToV0Message(lookupTableAccounts)

  const tx = new VersionedTransaction(message)
  return Buffer.from(
    tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }),
  ).toString("hex")
}
