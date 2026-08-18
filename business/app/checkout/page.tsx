import {
  CheckoutHubPills,
  CheckoutIntegrationHub,
} from "@/components/checkout/checkout-integration-hub"

export default function CheckoutPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-4 border-b bg-background pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Online Checkout</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Take card and bank payments on your own website. Your products, cart, and checkout page
            stay yours — Easner supplies the payment form and settles the money into your Easner
            Balance.
          </p>
          <div className="mt-3">
            <CheckoutHubPills />
          </div>
        </div>
      </div>

      <CheckoutIntegrationHub />
    </div>
  )
}
