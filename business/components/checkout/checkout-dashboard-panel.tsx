"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckoutCodeBlock } from "@/components/checkout/checkout-code-block"
import type { CheckoutHubPayload } from "@/lib/checkout/hub-types"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export function CheckoutDashboardPanel({
  data,
  onEdit,
}: {
  data: CheckoutHubPayload
  onEdit: () => void
}) {
  const [framework, setFramework] = useState("html")
  const testKey = data.keys.find((key) => key.mode === "test")
  const liveKey = data.keys.find((key) => key.mode === "live")
  const publishable = liveKey?.publishable_key ?? testKey?.publishable_key ?? "easner_pk_test_…"
  const webhookOn = Boolean(data.settings.webhookUrl && data.settings.webhookSecretLast4)

  const snippets = useMemo(
    () => ({
      html: `<script src="https://js.easner.com/checkout.js"></script>
<div id="easner-checkout"></div>
<script>
  EasnerCheckout.mount("#easner-checkout", {
    publishableKey: "${publishable}",
    clientSecret: window.EASNER_CLIENT_SECRET,
  });
</script>`,
      next: `import Script from "next/script";

export function Pay() {
  return (
    <>
      <Script src="https://js.easner.com/checkout.js" />
      <div id="easner-checkout" />
    </>
  );
}`,
      node: `const res = await fetch("https://api.easner.com/v1/checkout/sessions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.EASNER_SECRET_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    mode: "payment",
    amount: 4900,
    currency: "usd",
    success_url: "https://yoursite.com/thanks",
    cancel_url: "https://yoursite.com/cart",
  }),
});`,
    }),
    [publishable],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onEdit}>
          {COLLECTIONS_COPY.editIntegration}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/transactions">{COLLECTIONS_COPY.viewTransactions}</Link>
        </Button>
      </div>

      <div className="space-y-5 rounded-xl border p-5 sm:p-6">
        <p className="text-sm font-medium text-foreground">{COLLECTIONS_COPY.dashboardTitle}</p>
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Publishable key</dt>
            <dd className="mt-1">
              {testKey || liveKey ? (
                <CheckoutCodeBlock code={publishable} />
              ) : (
                <span className="text-muted-foreground">None yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Websites</dt>
            <dd className="mt-1 font-mono text-xs">
              {data.settings.allowedOrigins.length
                ? data.settings.allowedOrigins.join(", ")
                : "None yet"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Secret key</dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              {(liveKey ?? testKey)
                ? `Ending ${(liveKey ?? testKey)?.secret_key_last4} – rotate in setup to reveal a new one.`
                : "None yet"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Webhook</dt>
            <dd className="mt-1 space-y-1">
              <Badge variant={webhookOn ? "default" : "secondary"}>
                {webhookOn ? COLLECTIONS_COPY.statusWebhookOn : COLLECTIONS_COPY.statusWebhookOff}
              </Badge>
              {data.settings.webhookUrl ? (
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {data.settings.webhookUrl}
                </p>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      <Tabs value={framework} onValueChange={setFramework}>
        <TabsList>
          <TabsTrigger value="html">HTML</TabsTrigger>
          <TabsTrigger value="next">Next.js</TabsTrigger>
          <TabsTrigger value="node">Node</TabsTrigger>
        </TabsList>
        <TabsContent value="html" className="mt-3">
          <CheckoutCodeBlock code={snippets.html} />
        </TabsContent>
        <TabsContent value="next" className="mt-3">
          <CheckoutCodeBlock code={snippets.next} />
        </TabsContent>
        <TabsContent value="node" className="mt-3">
          <CheckoutCodeBlock code={snippets.node} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
