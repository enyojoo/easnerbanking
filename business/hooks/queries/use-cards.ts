"use client"

import { useQuery } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"

export type CardStatus = "active" | "frozen" | "terminated" | "pending"

export interface CardRow {
  id: string
  last4: string
  status: CardStatus
  holder_name: string
  currency: string
  spend_limit_monthly: number | null
  created_at: string
  updated_at: string
  version?: number
}

export interface CardControls {
  atm_enabled: boolean
  online_enabled: boolean
  international_enabled: boolean
  merchant_block_categories: string[]
}

export function useCardsList() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.cards.list(scope) : ["cards", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<{ cards: CardRow[] }>("/api/business/cards"),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: true, freshness: "operational" },
  })
}

export function useCardDetail(cardId: string | null) {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope && cardId ? qk.cards.detail(scope, cardId) : ["cards", "detail", "disabled"],
    enabled: Boolean(scope) && Boolean(cardId),
    queryFn: () => apiFetch<CardRow>(`/api/business/cards/${cardId}`),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: true, freshness: "operational" },
  })
}

export function useCardControls(cardId: string | null) {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope && cardId
      ? qk.cards.controls(scope, cardId)
      : ["cards", "controls", "disabled"],
    enabled: Boolean(scope) && Boolean(cardId),
    queryFn: () => apiFetch<CardControls>(`/api/business/cards/${cardId}/controls`),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: false, freshness: "operational" },
  })
}
