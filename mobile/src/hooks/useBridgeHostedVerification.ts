import { useCallback, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { bridgeService, type BridgeKycLink } from '../lib/bridgeService'
import { hostedKycUrlForWebEmbed } from '../lib/hostedKycUrl'
import { openEasnerInAppBrowser } from '../lib/inAppBrowser'

export type BridgeHostedPhase = 'tos' | 'kyc'

type StartInput = {
  fullName: string
  email: string
  residenceCountry?: string
}

function embedUrl(link: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return Platform.OS === 'web' ? hostedKycUrlForWebEmbed(link, origin) : link
}

export function useBridgeHostedVerification() {
  const [isVisible, setIsVisible] = useState(false)
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<BridgeHostedPhase>('tos')
  const phaseRef = useRef<BridgeHostedPhase>('tos')
  const pendingKycUrl = useRef<string | null>(null)
  const startInputRef = useRef<StartInput | null>(null)
  const waitCloseRef = useRef<(() => void) | null>(null)
  const finishedRef = useRef(false)
  const openingKycRef = useRef(false)

  const settle = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    openingKycRef.current = false
    setIsVisible(false)
    waitCloseRef.current?.()
    waitCloseRef.current = null
    setTimeout(() => setUrl(''), 300)
  }, [])

  const hideSheet = useCallback(() => {
    setIsVisible(false)
    setTimeout(() => {
      if (phaseRef.current === 'kyc' && Platform.OS !== 'web') setUrl('')
    }, 300)
  }, [])

  const openKycInSheet = useCallback((kycUrl: string) => {
    pendingKycUrl.current = null
    phaseRef.current = 'kyc'
    setPhase('kyc')
    setUrl(embedUrl(kycUrl))
    setIsVisible(true)
  }, [])

  const resolveKycUrl = useCallback(async (): Promise<string | null> => {
    const stored = String(pendingKycUrl.current ?? '').trim()
    if (stored) return stored
    const input = startInputRef.current
    if (!input) return null
    const next = await bridgeService.getKycLink(input.fullName, input.email, input.residenceCountry)
    if (next.alreadyOnboarded || String(next.kyc_status || '').toLowerCase() === 'approved') {
      return null
    }
    return String(next.kyc_link || '').trim() || null
  }, [])

  const openPersonaInBrowser = useCallback(async (kycUrl: string) => {
    phaseRef.current = 'kyc'
    setPhase('kyc')
    pendingKycUrl.current = null
    hideSheet()
    try {
      await openEasnerInAppBrowser(kycUrl)
    } catch {
      openKycInSheet(kycUrl)
      return
    }
    settle()
  }, [hideSheet, openKycInSheet, settle])

  const continueToKyc = useCallback(async (signedAgreementId?: string | null) => {
    if (phaseRef.current === 'kyc' || openingKycRef.current) return
    openingKycRef.current = true
    const signed = String(signedAgreementId ?? '').trim()
    if (signed) void bridgeService.acceptTos(signed).catch(() => undefined)
    try {
      const kyc = await resolveKycUrl()
      if (!kyc) {
        settle()
        return
      }
      if (Platform.OS === 'web') {
        openKycInSheet(kyc)
        openingKycRef.current = false
        return
      }
      await openPersonaInBrowser(kyc)
    } catch {
      settle()
    }
  }, [openKycInSheet, openPersonaInBrowser, resolveKycUrl, settle])

  const start = useCallback(
    async (input: StartInput): Promise<BridgeKycLink> => {
      startInputRef.current = input
      finishedRef.current = false
      openingKycRef.current = false
      const response = await bridgeService.getKycLink(input.fullName, input.email, input.residenceCountry)
      const tos = String(response.tos_link || '').trim()
      const kyc = String(response.kyc_link || '').trim()
      const approved =
        Boolean(response.alreadyOnboarded) || String(response.kyc_status || '').toLowerCase() === 'approved'
      if (approved || (!tos && !kyc)) return response

      if (kyc) {
        if (Platform.OS !== 'web') {
          await openPersonaInBrowser(kyc)
          return response
        }
        await new Promise<void>((resolve) => {
          waitCloseRef.current = resolve
          pendingKycUrl.current = null
          phaseRef.current = 'kyc'
          setPhase('kyc')
          setUrl(embedUrl(kyc))
          setIsVisible(true)
        })
        return response
      }

      await new Promise<void>((resolve) => {
        waitCloseRef.current = resolve
        pendingKycUrl.current = null
        phaseRef.current = 'tos'
        setPhase('tos')
        setUrl(tos)
        setIsVisible(true)
      })
      return response
    },
    [openPersonaInBrowser],
  )

  const onHostedEvent = useCallback(
    (kind: 'tos' | 'complete', signedAgreementId?: string | null) => {
      if (kind === 'tos' || phaseRef.current === 'tos') {
        void continueToKyc(signedAgreementId)
        return
      }
      settle()
    },
    [continueToKyc, settle],
  )

  return {
    isVisible,
    url,
    phase,
    title: 'Verification for bank accounts',
    start,
    close: settle,
    onHostedEvent,
  }
}
