import Link from "next/link"
import { ArrowUpRight, BookOpen, Code, KeyRound, Webhook } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const docs = [
  {
    title: "Checkout quickstart",
    description: "Take your first payment with the embedded checkout in about 10 minutes.",
    icon: BookOpen,
    href: "/developers/checkout",
  },
  {
    title: "API reference",
    description: "Create and read checkout sessions: fields, responses, errors, idempotency.",
    icon: Code,
    href: "/developers/checkout/api",
  },
  {
    title: "Webhooks",
    description: "Receive signed events for payments and subscriptions, with automatic retries.",
    icon: Webhook,
    href: "/developers/checkout/webhooks",
  },
  {
    title: "API keys & settings",
    description: "Add your website, create and rotate keys, and configure webhooks on the Checkout page.",
    icon: KeyRound,
    href: "/checkout",
  },
]

export default function DevelopersOverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Developers</h1>
        <p className="text-muted-foreground mt-2">
          Everything you need to accept payments on your website with Easner Checkout.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {docs.map((doc) => {
          const IconComponent = doc.icon
          return (
            <Link key={doc.title} href={doc.href}>
              <Card className="group h-full cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-inset ring-border/60">
                      <IconComponent className="h-6 w-6 text-muted-foreground" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary">
                          {doc.title}
                        </h3>
                        <ArrowUpRight
                          className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {doc.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
