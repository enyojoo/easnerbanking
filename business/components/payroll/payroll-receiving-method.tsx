import { AtSign, Landmark, Smartphone, Wallet } from "lucide-react"
import type { PayrollPerson } from "@/lib/payroll/types"

export function PayrollReceivingMethod({ person, typeOnly = false }: { person: PayrollPerson; typeOnly?: boolean }) {
  const method = person.receivingMethodSummary
  const type =
    method?.type ??
    (person.rail === "easetag"
      ? "easetag"
      : person.rail === "mobile"
        ? "mobile_money"
        : person.rail === "crypto"
          ? "stablecoin"
          : "bank")
  const Icon =
    type === "easetag" ? AtSign : type === "mobile_money" ? Smartphone : type === "stablecoin" ? Wallet : Landmark
  const typeLabel =
    type === "easetag"
      ? "Easetag"
      : type === "mobile_money"
        ? "Mobile money"
        : type === "stablecoin"
          ? "Stablecoin wallet"
          : "Bank account"
  const label = typeOnly
    ? typeLabel
    : method?.label ||
      (type === "easetag"
        ? person.easetag
          ? `@${person.easetag.replace(/^@/, "")}`
          : "Easetag"
        : type === "mobile_money"
          ? "Mobile money"
          : type === "stablecoin"
            ? "Stablecoin wallet"
            : "Bank account")
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="max-w-36 truncate">{label}</span>
    </span>
  )
}
