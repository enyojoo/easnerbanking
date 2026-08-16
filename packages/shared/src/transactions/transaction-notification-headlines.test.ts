import { describe, expect, it } from "vitest"
import {
  activityLabelForNotification,
  buildTransactionNotificationHeadlines,
} from "./transaction-notification-headlines"

describe("buildTransactionNotificationHeadlines", () => {
  it("uses complete for success", () => {
    expect(buildTransactionNotificationHeadlines("Bank deposit", "success")).toEqual({
      pushTitle: "Bank deposit complete",
      emailSubject: "Bank deposit complete",
      title: "Bank deposit complete",
    })
  })

  it("uses failed headline for failures", () => {
    expect(buildTransactionNotificationHeadlines("Easetag transfer", "failed")).toEqual({
      pushTitle: "Easetag transfer failed",
      emailSubject: "Easetag transfer failed",
      title: "Easetag transfer couldn't be completed",
    })
  })

  it("uses branded subject for reversals", () => {
    expect(buildTransactionNotificationHeadlines("Easetag transfer", "reversed")).toEqual({
      pushTitle: "Transaction reversed",
      emailSubject: "Transaction reversed",
      title: "Transaction reversed",
    })
  })

  it("uses literal success line for bank verification deposit", () => {
    expect(
      buildTransactionNotificationHeadlines("Bank verification deposit", "success", {
        successUsesCompleteSuffix: false,
      }),
    ).toEqual({
      pushTitle: "Bank verification deposit",
      emailSubject: "Bank verification deposit",
      title: "Bank verification deposit",
    })
  })
})

describe("activityLabelForNotification", () => {
  it("maps easetag and card kinds", () => {
    expect(activityLabelForNotification("easetag_send", "Easetag Send")).toBe("Easetag transfer")
    expect(activityLabelForNotification("easetag_receive", "Easetag Received")).toBe("Easetag deposit")
    expect(activityLabelForNotification("card_topup", "Card top up")).toBe("Card top-up")
  })
})
