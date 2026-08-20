import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Easner badge – soft pill shapes, muted tones, never oversaturated.
 * Emerald only for positive / premium-active states.
 */
const badgeVariants = cva(
  [
    'inline-flex items-center justify-center gap-1 w-fit whitespace-nowrap shrink-0 overflow-hidden',
    'rounded-full border px-3 py-1 text-xs font-medium',
    '[&>svg]:size-3 [&>svg]:pointer-events-none',
    'transition-[color,background-color,border-color] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
    'aria-invalid:border-destructive',
  ].join(' '),
  {
    variants: {
      variant: {
        /** Neutral/default – for quiet metadata chips */
        neutral:
          'bg-muted text-foreground border-transparent [a&]:hover:bg-muted/80',
        /** Emerald – positive states, premium tier, active/confirmed */
        emerald:
          'bg-primary/12 text-primary border-transparent [a&]:hover:bg-primary/18 dark:bg-primary/15 dark:text-primary',
        /** Amber – operational warnings */
        amber:
          'bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))] border-transparent',
        /** Oxblood – serious errors, never bright red */
        oxblood:
          'bg-destructive/12 text-destructive border-transparent [a&]:hover:bg-destructive/18',
        /** Slate – info / quiet meta */
        slate:
          'bg-muted text-muted-foreground border-transparent',
        /** Outline – subtle boundary chip */
        outline:
          'bg-transparent text-foreground border-border',
        /** Solid – strongest emphasis (graphite on ivory) */
        solid:
          'bg-foreground text-background border-transparent',

        /* Back-compat aliases for legacy callers */
        default: 'bg-primary/12 text-primary border-transparent',
        secondary: 'bg-muted text-muted-foreground border-transparent',
        destructive: 'bg-destructive/12 text-destructive border-transparent',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
