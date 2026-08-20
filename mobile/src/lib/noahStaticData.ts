import type { Currency } from '../types'

function ts(): string {
  return new Date().toISOString()
}

/** Noah wallet / send flow uses USD, EUR, GBP – no `currencies` table on Supabase. */
export const NOAH_CONTEXT_CURRENCIES: Currency[] = [
  {
    id: 'noah-usd',
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    flag: '🇺🇸',
    status: 'active',
    can_send: true,
    can_receive: true,
    created_at: ts(),
    updated_at: ts(),
  },
  {
    id: 'noah-eur',
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    flag: '🇪🇺',
    status: 'active',
    can_send: true,
    can_receive: true,
    created_at: ts(),
    updated_at: ts(),
  },
  {
    id: 'noah-gbp',
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    flag: '🇬🇧',
    status: 'active',
    can_send: true,
    can_receive: true,
    created_at: ts(),
    updated_at: ts(),
  },
]
