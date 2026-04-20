import { useQuery } from '@tanstack/react-query'
import { noahService } from '../../lib/noahService'
import { useScope } from '../../query/scope'
import type { PaymentMethod } from '../../types'

function mapVirtualAccountsToPaymentMethods(input: {
  usd: Awaited<ReturnType<typeof noahService.getVirtualAccount>>
  eur: Awaited<ReturnType<typeof noahService.getVirtualAccount>>
}): PaymentMethod[] {
  const { usd, eur } = input
  const now = new Date().toISOString()
  const methods: PaymentMethod[] = []
  if (usd?.hasAccount) {
    methods.push({
      id: 'noah-va-usd',
      currency: 'USD',
      type: 'bank_account',
      name: 'USD receiving account',
      account_name: usd.accountHolderName,
      account_number: usd.accountNumber ?? '',
      bank_name: usd.bankName ?? '',
      routing_number: usd.routingNumber,
      iban: usd.iban,
      swift_bic: usd.bic,
      is_default: true,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
  }
  if (eur?.hasAccount) {
    methods.push({
      id: 'noah-va-eur',
      currency: 'EUR',
      type: 'bank_account',
      name: 'EUR receiving account',
      account_name: eur.accountHolderName,
      account_number: eur.accountNumber ?? '',
      bank_name: eur.bankName ?? '',
      routing_number: eur.routingNumber,
      iban: eur.iban,
      swift_bic: eur.bic,
      is_default: !usd?.hasAccount,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
  }
  return methods
}

export function usePaymentMethodsList() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? ['payment-methods', scope.userId] : ['payment-methods', 'disabled'],
    enabled: Boolean(scope),
    queryFn: async () => {
      const [usd, eur] = await Promise.all([
        noahService.getVirtualAccount('usd'),
        noahService.getVirtualAccount('eur'),
      ])
      return mapVirtualAccountsToPaymentMethods({ usd, eur })
    },
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, freshness: 'operational' },
  })
}
