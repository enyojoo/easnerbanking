export default function PayCustomerRootPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-lg font-semibold text-foreground">Nothing to pay here</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Open the payment link a business shared with you, or scan their code again.
      </p>
    </div>
  )
}
