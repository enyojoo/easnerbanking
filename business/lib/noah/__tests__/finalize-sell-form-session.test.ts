import { describe, expect, it } from "vitest"
import {
  assertSellFormSessionReady,
  buildAckFormForNextStep,
  buildPrepareBody,
  extractBeneficiaryAckContext,
  parseNoahFormNextStep,
  parsePrepareSellRaw,
  sellFormSessionNeedsFinalize,
} from "@/lib/noah/finalize-sell-form-session"

describe("buildPrepareBody", () => {
  it("always includes PascalCase ChannelID and CryptoCurrency for Noah schema", () => {
    expect(
      buildPrepareBody({
        channelId: "ch-1",
        cryptoCurrency: "USDC",
        fiatAmount: "1000.00",
        formSessionId: "sess-1",
        form: { Confirmed: true },
        delayedSell: true,
      }),
    ).toEqual({
      ChannelID: "ch-1",
      CryptoCurrency: "USDC",
      FiatAmount: "1000.00",
      FormSessionID: "sess-1",
      Form: { Confirmed: true },
      DelayedSell: true,
    })
  })

  it("omits empty Form on seal follow-up steps", () => {
    const body = buildPrepareBody({
      channelId: "ch-1",
      cryptoCurrency: "USDC",
      fiatAmount: "1000.00",
      formSessionId: "sess-1",
      form: {},
      delayedSell: true,
    })
    expect(body).not.toHaveProperty("Form")
    expect(body.ChannelID).toBe("ch-1")
    expect(body.CryptoCurrency).toBe("USDC")
  })
})

describe("parsePrepareSellRaw", () => {
  it("preserves formSessionId when follow-up prepare omits it", () => {
    const previous = parsePrepareSellRaw({
      FormSessionID: "abc-123",
      CryptoAuthorizedAmount: "4.52",
      CryptoAmountEstimate: "4.50",
      TotalFee: "0.02",
    })
    expect(
      parsePrepareSellRaw({ FormSessionComplete: true }, previous),
    ).toMatchObject({
      formSessionId: "abc-123",
      cryptoAuthorizedAmount: "4.52",
      cryptoAmountEstimate: "4.50",
      totalFee: "0.02",
    })
  })

  it("parses Breakdown ChannelFee and Remaining when present", () => {
    const parsed = parsePrepareSellRaw({
      FormSessionID: "abc-123",
      CryptoAuthorizedAmount: "4.52",
      TotalFee: "0.02",
      Breakdown: [
        { Type: "ChannelFee", Amount: "0.788" },
        { Type: "Remaining", Amount: "3.687403" },
      ],
    })
    expect(parsed.channelFee).toBe(0.788)
    expect(parsed.remaining).toBeCloseTo(3.687403, 4)
  })
})

describe("parseNoahFormNextStep", () => {
  it("reads Pascal-case NextStep with schema", () => {
    expect(
      parseNoahFormNextStep({
        NextStep: {
          StepID: "Cob",
          StepType: "Ack",
          Schema: { type: "object", properties: { Confirmed: { type: "boolean" } } },
        },
      }),
    ).toEqual({
      stepId: "Cob",
      stepType: "Ack",
      schema: { type: "object", properties: { Confirmed: { type: "boolean" } } },
    })
  })
})

describe("buildAckFormForNextStep", () => {
  it("fills boolean fields from schema", () => {
    expect(
      buildAckFormForNextStep({
        stepId: "Cob",
        stepType: "Ack",
        schema: {
          type: "object",
          properties: { Confirmed: { type: "boolean" } },
        },
      }),
    ).toEqual({ Confirmed: true })
  })

  it("fills required string beneficiary name from context", () => {
    expect(
      buildAckFormForNextStep(
        {
          stepId: "Cob",
          stepType: "Ack",
          schema: {
            type: "object",
            title: "Confirm beneficiary",
            properties: {
              BeneficiaryAccountName: { type: "string" },
              Confirmed: { type: "boolean" },
            },
            required: ["BeneficiaryAccountName", "Confirmed"],
          },
        },
        { BeneficiaryAccountName: "Samuel Enyojo Odiba" },
      ),
    ).toEqual({
      BeneficiaryAccountName: "Samuel Enyojo Odiba",
      Confirmed: true,
    })
  })

  it("falls back to confirm flags when no schema properties", () => {
    expect(buildAckFormForNextStep({ stepId: "Cob", stepType: "Ack" })).toEqual({
      Confirmed: true,
      Acknowledged: true,
      Cob: { Confirmed: true, Acknowledged: true },
    })
  })
})

describe("extractBeneficiaryAckContext", () => {
  it("reads full name from AccountHolderName on initial form", () => {
    expect(
      extractBeneficiaryAckContext(
        {},
        {
          AccountHolderName: {
            AccountHolderType: "Individual",
            Name: { FirstName: "Samuel", LastName: "Odiba" },
          },
        },
      ),
    ).toMatchObject({
      BeneficiaryName: "Samuel Odiba",
      BeneficiaryAccountName: "Samuel Odiba",
    })
  })
})

describe("sellFormSessionNeedsFinalize", () => {
  it("returns true when NextStep is present", () => {
    expect(sellFormSessionNeedsFinalize({ NextStep: { StepID: "Cob" } })).toBe(true)
  })

  it("returns false when session is marked complete", () => {
    expect(sellFormSessionNeedsFinalize({ FormSessionComplete: true })).toBe(false)
  })
})

describe("assertSellFormSessionReady", () => {
  it("throws when Cob step is still pending", () => {
    expect(() =>
      assertSellFormSessionReady({
        formSessionId: "abc",
        raw: { NextStep: { StepID: "Cob", StepType: "Ack" } },
      }),
    ).toThrow(/pending Cob/i)
  })

  it("passes when session has no pending step", () => {
    expect(() =>
      assertSellFormSessionReady({
        formSessionId: "abc",
        raw: { FormSessionComplete: true },
      }),
    ).not.toThrow()
  })
})
