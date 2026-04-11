import type { ReactNode } from 'react'
import type { Recipient } from '../types'
import { useEasenetRecipientHydration } from '../hooks/useEasenetRecipientHydration'
import { EasenetLookupPreview } from './EasenetLookupPreview'

type Props = {
  recipient: Recipient
  getInitials: (name: string) => string
  variant?: 'card' | 'row'
  titleEndAccessory?: ReactNode
}

/** Same as search preview: live public profile (avatar/logo + Business/Personal) merged with saved row. */
export function EasenetRecipientHydratedPreview({ recipient, getInitials, variant, titleEndAccessory }: Props) {
  const profile = useEasenetRecipientHydration(recipient)
  return (
    <EasenetLookupPreview
      variant={variant}
      profile={profile}
      getInitials={getInitials}
      titleEndAccessory={titleEndAccessory}
    />
  )
}
