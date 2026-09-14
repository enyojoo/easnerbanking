import { useState, useCallback, useRef } from 'react'
import { Platform } from 'react-native'
import { openEasnerInAppBrowser } from '../lib/inAppBrowser'
import { hostedKycUrlForWebEmbed } from '../lib/hostedKycUrl'

interface UseExternalLinkOptions {
  showBackButton?: boolean
}

export function useExternalLink(options: UseExternalLinkOptions = {}) {
  const [isVisible, setIsVisible] = useState(false)
  const [url, setUrl] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const waitCloseRef = useRef<(() => void) | null>(null)

  const openLink = useCallback(async (linkUrl: string, linkTitle?: string) => {
    const webOrigin = typeof window !== 'undefined' ? window.location.origin : ''
    const href =
      Platform.OS === 'web' ? hostedKycUrlForWebEmbed(linkUrl, webOrigin) : linkUrl
    setUrl(href)
    setTitle(linkTitle || '')

    // Expo web: same in-app hosted sheet Noah used (iframe WebView modal).
    if (Platform.OS === 'web') {
      setIsVisible(true)
      await new Promise<void>((resolve) => {
        waitCloseRef.current = resolve
      })
      return
    }

    try {
      // iOS SFSafariViewController / Android Chrome Custom Tabs.
      await openEasnerInAppBrowser(linkUrl)
      setIsVisible(false)
    } catch {
      // Fallback to in-app modal WebView when native browser fails.
      setIsVisible(true)
    }
  }, [])

  const closeLink = useCallback(() => {
    setIsVisible(false)
    waitCloseRef.current?.()
    waitCloseRef.current = null
    setTimeout(() => {
      setUrl('')
      setTitle('')
    }, 300)
  }, [])

  return {
    isVisible,
    url,
    title,
    openLink,
    closeLink,
    showBackButton: options.showBackButton || false,
  }
}
