import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Easner button — premium, tactile, monochrome-first.
 *
 * Intent levels:
 *   - default: graphite on ivory (the trusted, authoritative default)
 *   - primary: Easner blue (use sparingly — key action / confirmation)
 *   - secondary: ivory surface with stone border
 *   - ghost: minimal hover-only
 *   - outline: surface + border
 *   - destructive: muted oxblood
 *   - link: inline text action
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
    "transition-[background-color,color,box-shadow,transform] duration-150 ease-out",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    "outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "aria-invalid:border-destructive",
    "active:translate-y-[0.5px]",
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-foreground text-background hover:bg-foreground/90',
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]',
        secondary:
          'bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-border bg-background hover:bg-muted/60 hover:text-foreground',
        ghost:
          'text-foreground hover:bg-muted/70',
        link:
          'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 rounded-xl px-3.5 text-sm has-[>svg]:px-3',
        default: 'h-10 rounded-2xl px-5 text-sm has-[>svg]:px-4',
        lg: 'h-12 rounded-2xl px-6 text-[15px] has-[>svg]:px-5',
        icon: 'size-10 rounded-2xl',
        'icon-sm': 'size-9 rounded-xl',
        'icon-lg': 'size-12 rounded-2xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
