"use client"

import { useMemo, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckoutCodeBlock } from "@/components/checkout/checkout-code-block"
import {
  CHECKOUT_EVENT_CATALOG,
  CHECKOUT_RECIPES,
  recipeAiPrompt,
  recipeBrowserHtml,
  recipeDebugPrompt,
  recipeServerCurl,
  recipeServerNode,
  recipeVerifyWebhook,
  recipeWebhookHandler,
  type CheckoutRecipeId,
} from "@/lib/checkout/checkout-recipes"
import type { CheckoutSiteSetupStep } from "@/lib/checkout/checkout-phases"
import type { CheckoutHubPayload, CheckoutSite } from "@/lib/checkout/hub-types"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export function CheckoutGuideSheet({
  open,
  onOpenChange,
  data,
  site,
  focus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: CheckoutHubPayload
  site: CheckoutSite | null
  focus: "guide" | CheckoutSiteSetupStep
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {focus === "guide" ? COLLECTIONS_COPY.guideTitle : COLLECTIONS_COPY.stepCodeTitle}
          </SheetTitle>
          <SheetDescription>{COLLECTIONS_COPY.guideBlurb}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">
          {focus === "guide" ? (
            <CheckoutIntegrationGuide data={data} />
          ) : (
            <CheckoutStepCode data={data} site={site} step={focus} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CheckoutStepCode({
  data,
  site,
  step,
}: {
  data: CheckoutHubPayload
  site: CheckoutSite | null
  step: CheckoutSiteSetupStep
}) {
  const publishableKey =
    data.keys.find((key) => key.mode === "test")?.publishable_key ?? "easner_pk_test_…"
  const successUrl = site?.successUrl || "https://shop.yoursite.com/thanks"
  const cancelUrl = site?.cancelUrl || "https://shop.yoursite.com/cart"

  if (step === "website") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Checkout.js only loads on origins you register. Sessions must use a success URL on the same
          site.
        </p>
        <CheckoutCodeBlock
          label="Allowed origin"
          code={site?.origin || "https://shop.yoursite.com"}
        />
      </div>
    )
  }

  if (step === "urls") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Your server can send these when it creates a session. A thanks page is enough. Add{" "}
          {"?session_id={CHECKOUT_SESSION_ID}"} only if that page needs to look up the order.
        </p>
        <CheckoutCodeBlock
          label="POST /v1/checkout/sessions URLs"
          code={JSON.stringify({ success_url: successUrl, cancel_url: cancelUrl }, null, 2)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Publishable key in the browser. Secret key only on your server. The page never sees the
        amount. Keys and webhooks live in Console.
      </p>
      <CheckoutCodeBlock label="Browser" code={recipeBrowserHtml(publishableKey)} />
      <CheckoutCodeBlock label="Server (Node)" code={recipeServerNode(CHECKOUT_RECIPES[0])} />
    </div>
  )
}

export function CheckoutIntegrationGuide({ data }: { data: CheckoutHubPayload }) {
  const [recipeId, setRecipeId] = useState<CheckoutRecipeId>("one_time")
  const publishableKey =
    data.keys.find((key) => key.mode === "test")?.publishable_key ?? "easner_pk_test_…"
  const recipe = CHECKOUT_RECIPES.find((item) => item.id === recipeId) ?? CHECKOUT_RECIPES[0]

  const snippets = useMemo(
    () => ({
      node: recipeServerNode(recipe),
      curl: recipeServerCurl(recipe),
      html: recipeBrowserHtml(publishableKey),
      webhook: recipeWebhookHandler(),
    }),
    [publishableKey, recipe],
  )

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">1. Before you start</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>Finish online payments setup so live charges settle to your Easner balance.</li>
          <li>Add your website origin and a success URL.</li>
          <li>Create test keys. Keep the secret key on your server.</li>
          <li>Add a webhook URL so you can fulfil after payment, not from the browser.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Mental model: your server creates a session (amount + metadata) → the customer pays with
          Checkout.js on your site → <code>checkout.completed</code> tells you to unlock access.
          Golden rule: amount and secret key never in the browser.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">2. Test on your website</h2>
        <p className="text-sm text-muted-foreground">
          Wire the recipe below into your site, then pay with card 4242 4242 4242 4242. Nothing is
          charged. That payment — on your origin — and a webhook 200 unlock live. Send test on the
          webhook step only checks that your endpoint is reachable.
        </p>
        <CheckoutCodeBlock
          label="curl one-liner"
          code={`curl https://api.easner.com/v1/checkout/sessions -H "Authorization: Bearer $EASNER_SECRET_KEY" -H "Content-Type: application/json" -d '{"mode":"payment","amount":4900,"currency":"usd","success_url":"https://yoursite.com/thanks"}'`}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">3. Integrate on your website</h2>
        <ol className="list-decimal pl-5 text-sm text-muted-foreground">
          <li>POST /v1/checkout/sessions from your server with the secret key.</li>
          <li>Return only client_secret to the page.</li>
          <li>Load js.easner.com/v1/checkout.js.</li>
          <li>Mount EasnerCheckout on the page with Checkout.js.</li>
          <li>Fulfil in the checkout.completed webhook using metadata.</li>
        </ol>
        <Tabs value={recipeId} onValueChange={(value) => setRecipeId(value as CheckoutRecipeId)}>
          <TabsList>
            {CHECKOUT_RECIPES.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.title}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={recipe.id} className="flex flex-col gap-4 pt-4">
            <p className="text-sm text-muted-foreground">{recipe.blurb}</p>
            <CheckoutCodeBlock label="Server (Node)" code={snippets.node} />
            <CheckoutCodeBlock label="Server (curl)" code={snippets.curl} />
            <CheckoutCodeBlock label="Browser (HTML)" code={snippets.html} />
            <CheckoutCodeBlock label="Webhook handler" code={snippets.webhook} />
            <CheckoutCodeBlock label="verifyWebhook()" code={recipeVerifyWebhook()} />
          </TabsContent>
        </Tabs>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">4. AI integration prompts</h2>
        <p className="text-sm text-muted-foreground">
          Paste into Cursor or another coding agent. Derived from the recipe above — not a separate
          source of truth.
        </p>
        <CheckoutCodeBlock label={`${recipe.title} prompt`} code={recipeAiPrompt(recipe)} />
        <CheckoutCodeBlock label="Debug prompt" code={recipeDebugPrompt()} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">5. Troubleshooting</h2>
        <div className="overflow-x-auto text-sm">
          <table className="w-full min-w-[480px] border-collapse text-left">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Symptom</th>
                <th className="py-2 font-medium">Fix</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-3">invalid_api_key</td>
                <td className="py-2">Use the secret key on the server. Publishable keys cannot create sessions.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-3">origin_not_allowed</td>
                <td className="py-2">Register the website and success URL in Checkout setup.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-3">Mount says key is not valid</td>
                <td className="py-2">The publishable key was revoked. Create new keys.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-3">Paid but access not unlocked</td>
                <td className="py-2">Fulfil in checkout.completed. Check Recent deliveries and Redeliver.</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Webhook signature fails</td>
                <td className="py-2">HMAC the raw body with t.payload using easner-signature, not a parsed JSON object.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Event catalog</h2>
        {CHECKOUT_EVENT_CATALOG.map((item) => (
          <CheckoutCodeBlock
            key={item.event}
            label={item.event}
            code={JSON.stringify(item.example, null, 2)}
          />
        ))}
      </section>
    </div>
  )
}
