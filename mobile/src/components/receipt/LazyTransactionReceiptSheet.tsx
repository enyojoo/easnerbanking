import React, { useEffect, useState } from 'react'
import type { ReceiptDetails } from './receipt-types'

type Props = {
  visible: boolean
  onClose: () => void
  receipt: ReceiptDetails | null
}

/**
 * Loads the receipt sheet (and its native deps) only when the user opens it.
 * TransactionDetailsScreen is imported eagerly by AppNavigator — keeping the
 * sheet out of that static import chain avoids evaluating receipt native modules at launch.
 */
export function LazyTransactionReceiptSheet({ visible, onClose, receipt }: Props) {
  const [Sheet, setSheet] = useState<React.ComponentType<Props> | null>(null)

  useEffect(() => {
    if (!visible || Sheet) return
    void import('./TransactionReceiptSheet').then((m) => {
      setSheet(() => m.TransactionReceiptSheet)
    })
  }, [visible, Sheet])

  if (!visible || !Sheet) return null
  return <Sheet visible={visible} onClose={onClose} receipt={receipt} />
}
