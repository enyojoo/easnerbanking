"use client"

import * as React from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * TransactionRow — executive ledger line.
 *
 * Rules:
 *   - Credits: emerald tint + emerald icon. Debits: neutral.
 *   - Amounts always tabular-nums.
 *   - No bright red on debits — privacy/private-bank tone demands restraint.
 */
export interface TransactionRowProps {
  description: string
  type: string
  date: string | Date
  amount: number
  currency?: string
  direction: 'credit' | 'debit'
  status?: 'completed' | 'pending' | 'processing' | 'failed'
  onClick?: () => void
  className?: string
}

const statusToBadge: Record<
  NonNullable<TransactionRowProps['status']>,
  React.ComponentProps<typeof Badge>['variant']
> = {
  completed: 'emerald',
  pending: 'amber',
  processing: 'amber',
  failed: 'oxblood',
}

export function TransactionRow({
  description,
  type,
  date,
  amount,
  currency = 'USD',
  direction,
  status,
  onClick,
  className,
}: TransactionRowProps) {
  const isCredit = direction === 'credit'
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))

  const dateLabel = new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3.5 transition-colors',
        onClick && 'cursor-pointer hover:bg-muted/60',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
            isCredit
              ? 'bg-primary/10 text-primary ring-primary/15'
              : 'bg-muted text-muted-foreground ring-border/60',
          )}
        >
          {isCredit ? (
            <ArrowDownLeft className="size-4 stroke-[1.75]" />
          ) : (
            <ArrowUpRight className="size-4 stroke-[1.75]" />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {description}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tracking-wide uppercase">{type}</span>
            <span aria-hidden>·</span>
            <span>{dateLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {status ? (
          <Badge variant={statusToBadge[status]} className="capitalize">
            {status}
          </Badge>
        ) : null}
        <div
          className={cn(
            'text-sm font-semibold tabular-nums',
            isCredit ? 'text-primary' : 'text-foreground',
          )}
        >
          {isCredit ? '+' : '−'}
          {formatted}
        </div>
      </div>
    </div>
  )
}
