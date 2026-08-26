"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckoutCodeBlock } from "@/components/checkout/checkout-code-block"
import { CheckoutWebhookDeliveries } from "@/components/checkout/checkout-webhook-deliveries"
import { fetchWithSession } from "@/lib/fetch-with-session"
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
import type { CheckoutHubPayload } from "@/lib/checkout/hub-types"

declare global {
  interface Window {
    EasnerCheckout?: {
      openOverlay: (options: {
        publishableKey: string
        clientSecret: string
        onSuccess?: () => void
      }) => Promise<unknown>
    }
  }
}

async function loadCheckoutJs(): Promise<void> {
  if (window.EasnerCheckout?.openOverlay) return
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "/checkout.js"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Could not load Easner Checkout"))
    document.head.appendChild(script)
  })
}

export function CheckoutIntegrationGuide({
  data,
  onSaved,
}: {
  data: CheckoutHubPayload
  onSaved: () => void
}) {
  const [recipeId, setRecipeId] = useState<CheckoutRecipeId>("one_time")
  const [trying, setTrying] = useState(false)
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

  const tryTest = async () => {
    setTrying(true)
    try {
      const res = await fetchWithSession("/api/checkout/try-test", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as {
        client_secret?: string
        publishable_key?: string
        error?: string
      }
      if (!res.ok || !body.client_secret) {
        toast.error(body.error || "Could not start a test checkout")
        return
      }
      await loadCheckoutJs()
      if (!window.EasnerCheckout?.openOverlay) {
        toast.error("Checkout script did not load")
        return
      }
      await window.EasnerCheckout.openOverlay({
        publishableKey: body.publishable_key || publishableKey,
        clientSecret: body.client_secret,
        onSuccess: () => {
          toast.success("Test payment received.")
          onSaved()
        },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open checkout")
    } finally {
      setTrying(false)
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">1. Before you start</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Finish Connect so live charges can settle to your Easner balance.</li>
          <li>Add your website origin and a success URL.</li>
          <li>Create test keys. Keep the secret key on your server.</li>
          <li>Add a webhook URL so you can fulfil after payment, not from the browser.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Mental model: your server creates a session (amount + metadata) → the customer pays in an
          overlay on your site → <code>checkout.completed</code> tells you to unlock access. Golden
          rule: amount and secret key never in the browser.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">2. Quick test</h2>
        <p className="text-sm text-muted-foreground">
          Create a $49.00 test session and pay in this page. Use card 4242 4242 4242 4242. Nothing is
          charged. You can also open the local HTML kit at <code>/checkout-test/test-checkout.html</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={trying || !data.keys.length} onClick={() => void tryTest()}>
            {trying ? "Opening…" : "Try test checkout"}
          </Button>
        </div>
        <CheckoutCodeBlock
          label="curl one-liner"
          code={`curl https://api.easner.com/v1/checkout/sessions -H "Authorization: Bearer $EASNER_SECRET_KEY" -H "Content-Type: application/json" -d '{"mode":"payment","amount":4900,"currency":"usd","success_url":"https://yoursite.com/thanks"}'`}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">3. Integrate on your website</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>POST /v1/checkout/sessions from your server with the secret key.</li>
          <li>Return only client_secret to the page.</li>
          <li>Load js.easner.com/v1/checkout.js.</li>
          <li>Call EasnerCheckout.openOverlay on Buy / Subscribe.</li>
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
          <TabsContent value={recipe.id} className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">{recipe.blurb}</p>
            <CheckoutCodeBlock label="Server (Node)" code={snippets.node} />
            <CheckoutCodeBlock label="Server (curl)" code={snippets.curl} />
            <CheckoutCodeBlock label="Browser (HTML)" code={snippets.html} />
            <CheckoutCodeBlock label="Webhook handler" code={snippets.webhook} />
            <CheckoutCodeBlock label="verifyWebhook()" code={recipeVerifyWebhook()} />
          </TabsContent>
        </Tabs>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">4. AI integration prompts</h2>
        <p className="text-sm text-muted-foreground">
          Paste into Cursor or another coding agent. Derived from the recipe above — not a separate source of truth.
        </p>
        <CheckoutCodeBlock label={`${recipe.title} prompt`} code={recipeAiPrompt(recipe)} />
        <CheckoutCodeBlock label="Debug prompt" code={recipeDebugPrompt()} />
      </section>

      <section className="space-y-3">
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

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Event catalog</h2>
        {CHECKOUT_EVENT_CATALOG.map((item) => (
          <CheckoutCodeBlock
            key={item.event}
            label={item.event}
            code={JSON.stringify(item.example, null, 2)}
          />
        ))}
        <CheckoutWebhookDeliveries live />
      </section>
    </div>
  )
}
