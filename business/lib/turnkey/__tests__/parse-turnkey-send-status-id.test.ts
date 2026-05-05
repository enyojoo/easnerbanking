import { describe, expect, it } from "vitest"
import { extractTurnkeySolSendTransactionStatusId } from "@/lib/turnkey/send"

describe("extractTurnkeySolSendTransactionStatusId", () => {
  it("does not infer status id from bare top-level activity id field", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        id: "sha256:36399724bffbdf1b1082b88868d8358ae12904780a9a77c67ecff85d91002c79",
      }),
    ).toBeNull()
  })

  it("accepts sendTransactionStatusId when Turnkey uses sha256 activity fingerprint (sponsored sol send)", () => {
    const fp = "sha256:c1b1c5e12cfb53cabb249da581037a922c572e71d52fc67fe18db95537c167eb"
    expect(
      extractTurnkeySolSendTransactionStatusId({
        activity: {
          status: "ACTIVITY_STATUS_COMPLETED",
          result: { sendTransactionStatusId: fp },
        },
      }),
    ).toBe(fp)
  })

  it("reads nested solSendTransactionResult from activity", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        activity: {
          status: "ACTIVITY_STATUS_COMPLETED",
          result: {
            solSendTransactionResult: { sendTransactionStatusId: "sts_abc123" },
          },
        },
      }),
    ).toBe("sts_abc123")
  })

  it("accepts snake_case nested result", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        activity: {
          result: {
            sol_send_transaction_result: { send_transaction_status_id: "sts_xyz" },
          },
        },
      }),
    ).toBe("sts_xyz")
  })

  it("prefers top-level sendTransactionStatusId when present", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        sendTransactionStatusId: "sts_top",
        id: "sha256:deadbeef",
      }),
    ).toBe("sts_top")
  })

  it("finds sendTransactionStatusId deep under arbitrary nesting", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        activity: {
          status: "ACTIVITY_STATUS_COMPLETED",
          result: {
            someWrapper: {
              payload: { send_transaction_status_id: "sts_deep" },
            },
          },
        },
      }),
    ).toBe("sts_deep")
  })

  it("parses stringified activity.result JSON", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        activity: {
          result: JSON.stringify({
            solSendTransactionResult: { sendTransactionStatusId: "sts_str_result" },
          }),
        },
      }),
    ).toBe("sts_str_result")
  })

  it("unwraps solSendTransactionResult provided as a single-element array", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        activity: {
          status: "ACTIVITY_STATUS_COMPLETED",
          result: {
            solSendTransactionResult: [{ sendTransactionStatusId: "sts_from_array" }],
          },
        },
      }),
    ).toBe("sts_from_array")
  })

  it("reads sendTransactionStatusId at activity.result root", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        activity: {
          result: {
            sendTransactionStatusId: "sts_flat_in_result",
          },
        },
      }),
    ).toBe("sts_flat_in_result")
  })

  it("extracts from appProofs proofPayload JSON", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        activity: {
          appProofs: [
            {
              proofPayload: JSON.stringify({
                nested: { sendTransactionStatusId: "sts_from_proof" },
              }),
            },
          ],
          result: {},
        },
      }),
    ).toBe("sts_from_proof")
  })
})
