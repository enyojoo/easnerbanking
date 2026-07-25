export function PayrollLegalNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground leading-relaxed ${className}`}>
      Easner moves money you instruct. Your business remains responsible for employment and tax
      obligations.
    </p>
  )
}
