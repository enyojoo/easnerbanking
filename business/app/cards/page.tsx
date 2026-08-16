"use client"

import { useState, useMemo } from "react"
import { TransactionDetailPrefetchLink } from "@/components/transactions/transaction-detail-prefetch-link"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { getDateRange, filterTransactions, type TransactionWithSource } from "@/lib/transactions"
import { useTransactionsCached } from "@/hooks/use-transactions-cached"
import { Button } from "@/components/ui/button"
import { Plus, Eye, Settings, Snowflake, ArrowUpRight, ArrowDownLeft, AlertCircle } from "lucide-react"
import { CardCarousel } from "@/components/card-carousel"
import { CardSettingsDialog } from "@/components/card-settings-dialog"
import { CardDetailsDialog } from "@/components/card-details-dialog"
import { DateRangeFilter, type TimePeriod } from "@/components/date-range-filter"
import { formatCurrency } from "@/lib/utils"
import type { Card } from "@/lib/finance-types"
import { PageIntro } from "@/components/copy/page-intro"
import { PAGE_COPY } from "@/lib/copy/business-ui-copy"

export default function CardsPage() {
  const { data: rows, loading: listLoading } = useTransactionsCached()
  const showListSkeleton = listLoading && rows.length === 0
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [frozenCardIds, setFrozenCardIds] = useState<Set<string>>(new Set())
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  })

  const cards: Card[] = []

  const toggleFreeze = () => {
    if (!selectedCard) return
    setFrozenCardIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(selectedCard.id)) {
        newSet.delete(selectedCard.id)
      } else {
        newSet.add(selectedCard.id)
      }
      return newSet
    })
  }

  const isCurrentCardFrozen = selectedCard ? frozenCardIds.has(selectedCard.id) : false

  const { start, end } = getDateRange({ timePeriod, customDateRange })
  const filteredTransactions = useMemo(
    () =>
      filterTransactions(rows, {
        start,
        end,
        source: "card",
      }),
    [rows, start, end],
  )

  const hasCards = cards.length > 0

  return (
    <div className="workspace-fill overflow-hidden">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <PageIntro title={PAGE_COPY.cards.title} description={PAGE_COPY.cards.intro} variant="page" />
        <Button className="gap-2" disabled={!hasCards}>
          <Plus className="h-4 w-4" />
          Add Card
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[440px_1fr] flex-1 min-h-0">
        <div className="space-y-6 flex-shrink-0 lg:flex-shrink">
          <CardCarousel
            cards={cards}
            onCardChange={(c) => setSelectedCard(c)}
            frozenCardIds={frozenCardIds}
          />

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full gap-2 bg-transparent"
              disabled={!hasCards}
              onClick={() => setDetailsOpen(true)}
            >
              <Eye className="h-4 w-4" />
              View Details
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 bg-transparent"
              disabled={!hasCards}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
              Card Settings
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 bg-transparent"
              disabled={!hasCards}
              onClick={toggleFreeze}
            >
              <Snowflake className="h-4 w-4" />
              {isCurrentCardFrozen ? "Unfreeze" : "Freeze"} Card
            </Button>
            {hasCards && selectedCard?.form === "physical" && (
              <Button variant="outline" className="w-full gap-2 bg-transparent">
                <AlertCircle className="h-4 w-4" />
                Report Lost
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col min-h-0 flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 flex-shrink-0">
            <h2 className="text-2xl font-semibold text-foreground">Transactions</h2>
            <DateRangeFilter
              timePeriod={timePeriod}
              customDateRange={customDateRange}
              onTimePeriodChange={setTimePeriod}
              onCustomDateRangeChange={setCustomDateRange}
            />
          </div>

          <div className="rounded-lg border bg-card flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto divide-y">
              {showListSkeleton ?
                <div className="space-y-3 p-4">
                  <div className="h-16 animate-pulse rounded-md bg-muted" />
                  <div className="h-16 animate-pulse rounded-md bg-muted" />
                  <div className="h-16 animate-pulse rounded-md bg-muted" />
                </div>
              : filteredTransactions.length === 0 ?
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No card transactions in this period.
                </div>
              : filteredTransactions.map((transaction) => {
                  return (
                    <TransactionDetailPrefetchLink
                      key={transaction.id}
                      href={transactionWebDetailPath(transaction.id)}
                      txId={transaction.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`rounded-full p-2 ${
                            transaction.direction === "credit" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {transaction.direction === "credit" ?
                            <ArrowDownLeft className="h-4 w-4" />
                          : <ArrowUpRight className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{transaction.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {transaction.cardId ?
                              `•••• ${transaction.cardLast4 ?? "----"}`
                            : transaction.category?.toUpperCase() ?? "CARD"}{" "}
                            • {new Date(transaction.date).toLocaleDateString()} •{" "}
                            {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          transaction.direction === "credit" ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {transaction.direction === "credit" ? "+" : "-"}
                        {formatCurrency(Math.abs(transaction.amount), transaction.displayCurrency || "USD")}
                      </p>
                    </TransactionDetailPrefetchLink>
                  )
                })
              }
            </div>
          </div>
        </div>
      </div>

      {selectedCard ?
        <>
          <CardDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} card={selectedCard} />
          <CardSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            cardLast4={selectedCard.last4}
            cardForm={selectedCard.form}
          />
        </>
      : null}
    </div>
  )
}
