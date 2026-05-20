import { describe, expect, it } from "vitest"
import { noahWebhookEventId } from "@/lib/noah/webhook-event-id"

describe("noahWebhookEventId", () => {
  it("uses Data.ID when present", () => {
    const id = noahWebhookEventId({
      EventType: "Transaction",
      EventVersion: "1",
      Data: { ID: "tx-abc", CustomerID: "cust-1" },
    })
    expect(id).toBe("noah:Transaction:tx-abc:1")
  })

  it("falls back to customer id", () => {
    const id = noahWebhookEventId({
      EventType: "Customer",
      EventVersion: "2",
      Data: { CustomerID: "cust-9" },
    })
    expect(id).toBe("noah:Customer:cust-9:2")
  })
})
