import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Easner card – office admin variant. Mirrors business/components/ui/card.tsx.
 */
const cardVariants = cva(
  [
    "flex flex-col gap-6 bg-card text-card-foreground",
    "rounded-3xl border border-border/60",
    "transition-[box-shadow,border-color] duration-200",
  ].join(" "),
  {
    variants: {
      elevation: {
        flat: "shadow-none",
        soft: "shadow-[var(--shadow-soft)] dark:shadow-none dark:border-border",
        card: "shadow-[var(--shadow-card)] dark:shadow-[var(--shadow-soft)]",
        lift: "shadow-[var(--shadow-lift)] dark:shadow-[var(--shadow-card)]",
      },
      padding: {
        none: "py-0",
        sm: "py-5",
        md: "py-6",
        lg: "py-8",
      },
    },
    defaultVariants: {
      elevation: "soft",
      padding: "md",
    },
  }
)

function Card({
  className,
  elevation,
  padding,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ elevation, padding }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 md:px-8 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base font-semibold leading-none tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 md:px-8", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center px-6 md:px-8 [.border-t]:pt-6",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}
