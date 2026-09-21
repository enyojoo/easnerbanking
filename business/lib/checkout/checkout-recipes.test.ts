import { describe, expect, it } from "vitest"
import { CHECKOUT_RECIPES, recipeAiPrompt, recipeBrowserHtml, recipeVerifyWebhook, recipeWebhookHandler } from "./checkout-recipes"

describe("checkout recipes", () => {
  it("keeps the three use-case tabs", () => {
    expect(CHECKOUT_RECIPES.map((recipe) => recipe.id)).toEqual(["one_time", "subscription", "custom"])
  })

  it("derives AI prompts from the recipe session body", () => {
    const recipe = CHECKOUT_RECIPES[1]
    const prompt = recipeAiPrompt(recipe)
    expect(prompt).toContain('"plan": "pro"')
    expect(prompt).toContain("subscription.updated")
  })

  it("documents easner-signature HMAC verification", () => {
    expect(recipeWebhookHandler()).toContain("easner-signature")
    expect(recipeVerifyWebhook()).toContain("createHmac")
  })

  it("mounts Checkout.js on the merchant site", () => {
    const html = recipeBrowserHtml("easner_pk_test_x")
    expect(html).toContain("EasnerCheckout.mount")
    expect(html).not.toContain("openOverlay")
  })
})
