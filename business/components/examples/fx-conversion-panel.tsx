"use client"

import * as React from 'react'
import { ArrowDownUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * FxConversionPanel — a CFO-style quote card.
 *
 * Composition:
 *   - Two amount fields separated by a swap affordance.
 *   - Editorial display of "You get" total in serif.
 *   - Emerald primary action; everything else monochrome.
 */
export interface FxConversionPanelProps {
  fromCurrency: string
  toCurrency: string
  fromAmount: string
  onFromAmountChange: (v: string) => void
  rate: number
  toAmount: string
  onSwap?: () => void
  onConfirm?: () => void
  className?: string
  fee?: string
  quoteLabel?: string
}

export function FxConversionPanel({
  fromCurrency,
  toCurrency,
  fromAmount,
  onFromAmountChange,
  rate,
  toAmount,
  onSwap,
  onConfirm,
  className,
  fee,
  quoteLabel = 'Mid-market quote',
}: FxConversionPanelProps) {
  return (
    <Card elevation="card" padding="none" className={cn('overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border/60 px-8 py-5">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {quoteLabel}
          </span>
          <span className="mt-1 text-sm text-foreground tabular-nums">
            1 {fromCurrency} = {rate.toFixed(4)} {toCurrency}
          </span>
        </div>
      </div>

      <div className="relative flex flex-col gap-2 px-8 py-6">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            You send
          </span>
          <div className="flex items-center gap-3">
            <Input
              inputMode="decimal"
              value={fromAmount}
              onChange={(e) => onFromAmountChange(e.target.value)}
              placeholder="0.00"
              className="text-lg tabular-nums"
            />
            <span className="inline-flex h-12 min-w-20 items-center justify-center rounded-2xl border border-border/70 bg-muted px-4 text-sm font-semibold tracking-wide text-foreground">
              {fromCurrency}
            </span>
          </div>
        </label>

        <div className="relative flex items-center justify-center py-2">
          <div aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="relative size-9 rounded-full"
            aria-label="Swap currencies"
            onClick={onSwap}
          >
            <ArrowDownUp className="size-4 stroke-[1.75]" />
          </Button>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            You receive
          </span>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-full items-center rounded-2xl border border-border/60 bg-muted/40 px-4">
              <span className="font-serif text-2xl font-medium tracking-tight text-foreground tabular-nums">
                {toAmount || '0.00'}
              </span>
            </div>
            <span className="inline-flex h-12 min-w-20 items-center justify-center rounded-2xl border border-border/70 bg-muted px-4 text-sm font-semibold tracking-wide text-foreground">
              {toCurrency}
            </span>
          </div>
        </label>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
        {fee ? (
          <span className="text-xs text-muted-foreground">Fee {fee}</span>
        ) : (
          <span className="text-xs text-muted-foreground">No hidden fees</span>
        )}
        {onConfirm ? (
          <Button variant="primary" size="lg" onClick={onConfirm}>
            Confirm conversion
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
