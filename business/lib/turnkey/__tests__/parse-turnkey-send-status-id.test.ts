import { describe, expect, it } from "vitest"
import { extractTurnkeySolSendTransactionStatusId } from "@/lib/turnkey/send"

describe("extractTurnkeySolSendTransactionStatusId", () => {
  it("rejects sha256 fingerprint masquerading as status id", () => {
    expect(
      extractTurnkeySolSendTransactionStatusId({
        id: "sha256:36399724bffbdf1b1082b88868d8358ae12904780a9a77c67ecff85d91002c79",
      }),
    ).toBeNull()
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
})
