import { describe, expect, it } from "vitest"
import {
  EXPRESS_DEPOSITS_COPY,
  EXPRESS_US_SSN_ID_TYPE,
  buildExpressKycSubmitInfo,
  expressDepositMethodSubtitle,
  expressDepositSavePaymentHint,
  expressDepositSavePaymentTitle,
  expressDepositsVerificationCta,
  expressSetupUserMessage,
  isUsSsnComplete,
  normalizeUsSsn,
} from "./express-deposits-copy"

describe("US SSN helpers", () => {
  it("normalizes digits and builds submitKycInfo id_number", () => {
    expect(normalizeUsSsn("123-45-6789")).toBe("123456789")
    expect(isUsSsnComplete("123-45-6789")).toBe(true)
    expect(isUsSsnComplete("12345")).toBe(false)
    const payload = buildExpressKycSubmitInfo({
      form: {
        given_name: "Ada",
        surname: "Lovelace",
        dob_day: "10",
        dob_month: "12",
        dob_year: "1815",
        line1: "1 Main",
        city: "Boston",
        state: "MA",
        postal_code: "02108",
        ssn: "123-45-6789",
      },
      country: "US",
      includeUsSsn: true,
    })
    expect(payload.id_number).toEqual({ type: EXPRESS_US_SSN_ID_TYPE, value: "123456789" })
  })

  it("builds EU KYC without SSN and uppercases nationalities", () => {
    const payload = buildExpressKycSubmitInfo({
      form: {
        given_name: "Ada",
        surname: "Lovelace",
        dob_day: "10",
        dob_month: "12",
        dob_year: "1815",
        line1: "1 Main",
        city: "Berlin",
        postal_code: "10115",
        nationalities: "de, fr",
        birth_city: "Berlin",
        birth_country: "DE",
      },
      country: "DE",
      eu: true,
    })
    expect(payload.id_number).toBeUndefined()
    expect(payload.nationalities).toEqual(["DE", "FR"])
    expect(payload.birth_city).toBe("Berlin")
    expect(payload.birth_country).toBe("DE")
    expect(
      buildExpressKycSubmitInfo({
        form: { given_name: "Ada", surname: "Lovelace" },
        country: "DE",
        eu: true,
      }).nationalities,
    ).toEqual([])
  })

  it("omits SSN unless asked", () => {
    const payload = buildExpressKycSubmitInfo({
      form: { given_name: "Ada", surname: "Lovelace", ssn: "123456789" },
      country: "US",
    })
    expect(payload.id_number).toBeUndefined()
  })
})

describe("express deposit method copy", () => {
  it("uses a distinct subtitle per method", () => {
    const card = expressDepositMethodSubtitle("express_card")
    const apple = expressDepositMethodSubtitle("express_apple_pay")
    const google = expressDepositMethodSubtitle("express_google_pay")
    const ach = expressDepositMethodSubtitle("express_ach")
    expect(new Set([card, apple, google, ach]).size).toBe(4)
    expect(card).toBe(EXPRESS_DEPOSITS_COPY.cardHint)
    expect(apple).toBe(EXPRESS_DEPOSITS_COPY.applePayHint)
    expect(google).toBe(EXPRESS_DEPOSITS_COPY.googlePayHint)
    expect(ach).toBe(EXPRESS_DEPOSITS_COPY.achHint)
    expect(card).not.toBe(EXPRESS_DEPOSITS_COPY.description)
    expect(expressDepositMethodSubtitle("express_card", { ready: false })).toBe(
      EXPRESS_DEPOSITS_COPY.setupRequiredHint,
    )
    expect(expressDepositMethodSubtitle("express_card")).toBe(EXPRESS_DEPOSITS_COPY.cardHint)
    expect(expressDepositMethodSubtitle("express_card", { ready: undefined })).toBe(
      EXPRESS_DEPOSITS_COPY.cardHint,
    )
  })
})

describe("expressDepositSavePaymentCopy", () => {
  it("uses rail-specific titles and hints without window jargon", () => {
    expect(expressDepositSavePaymentTitle("express_card")).toBe("Add your card")
    expect(expressDepositSavePaymentHint("express_card")).toBe(
      "Enter your card details to finish this deposit.",
    )
    expect(expressDepositSavePaymentTitle("express_ach")).toBe("Link your bank")
    expect(expressDepositSavePaymentHint("express_ach")).toBe(
      "Connect your bank account to finish this deposit.",
    )
    expect(expressDepositSavePaymentHint("express_card")).not.toMatch(/window/i)
  })
})

describe("expressSetupUserMessage", () => {
  it("hides Stripe Link session errors", () => {
    expect(expressSetupUserMessage("User is not authenticated")).toBe(
      EXPRESS_DEPOSITS_COPY.somethingWentWrong,
    )
  })
})

describe("express setup done copy", () => {
  it("describes completion without vendor names", () => {
    expect(EXPRESS_DEPOSITS_COPY.readyTitle).toBe("You're set up")
    expect(EXPRESS_DEPOSITS_COPY.readyBody).toBe(
      "You can add money with a card, mobile wallet, or ACH.",
    )
    expect(EXPRESS_DEPOSITS_COPY.addMoneyCta).toBe("Add money")
    expect(EXPRESS_DEPOSITS_COPY.changePaymentCta).toBe("Change")
    const hay = `${EXPRESS_DEPOSITS_COPY.readyTitle} ${EXPRESS_DEPOSITS_COPY.readyBody} ${EXPRESS_DEPOSITS_COPY.addMoneyCta} ${EXPRESS_DEPOSITS_COPY.changePaymentCta}`.toLowerCase()
    expect(hay).not.toMatch(/stripe|link|onramp|crypto/)
  })
})

describe("expressDepositsVerificationCta", () => {
  it("hides the button when verified, like US banking", () => {
    expect(expressDepositsVerificationCta("approved")).toBeNull()
    expect(expressDepositsVerificationCta("ready")).toBeNull()
    expect(expressDepositsVerificationCta("verified")).toBeNull()
  })

  it("uses Continue while setup is in progress and Set up before it starts", () => {
    expect(expressDepositsVerificationCta("in_progress")).toBe(EXPRESS_DEPOSITS_COPY.continueCta)
    expect(expressDepositsVerificationCta("in_review")).toBe(EXPRESS_DEPOSITS_COPY.continueCta)
    expect(expressDepositsVerificationCta("not_started")).toBe(EXPRESS_DEPOSITS_COPY.setupCta)
    expect(expressDepositsVerificationCta(null)).toBe(EXPRESS_DEPOSITS_COPY.setupCta)
  })
})
