import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "inline-flex items-center justify-center gap-1 w-fit whitespace-nowrap shrink-0 overflow-hidden",
    "rounded-full border px-3 py-1 text-xs font-medium",
    "[&>svg]:size-3 [&>svg]:pointer-events-none",
    "transition-[color,background-color,border-color] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  ].join(" "),
  {
    variants: {
      variant: {
        neutral:
          "bg-muted text-foreground border-transparent",
        emerald:
          "bg-primary/12 text-primary border-transparent dark:bg-primary/15",
        amber:
          "bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))] border-transparent",
        oxblood:
          "bg-destructive/12 text-destructive border-transparent",
        slate:
          "bg-muted text-muted-foreground border-transparent",
        outline:
          "bg-transparent text-foreground border-border",
        solid:
          "bg-foreground text-background border-transparent",

        default: "bg-primary/12 text-primary border-transparent",
        secondary: "bg-muted text-muted-foreground border-transparent",
        destructive: "bg-destructive/12 text-destructive border-transparent",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
