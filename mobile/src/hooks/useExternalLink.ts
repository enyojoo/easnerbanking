import { useState, useCallback } from 'react'
import { openEasnerInAppBrowser } from '../lib/inAppBrowser'

interface UseExternalLinkOptions {
  showBackButton?: boolean
}

export function useExternalLink(options: UseExternalLinkOptions = {}) {
  const [isVisible, setIsVisible] = useState(false)
  const [url, setUrl] = useState<string>('')
  const [title, setTitle] = useState<string>('')

  const openLink = useCallback(async (linkUrl: string, linkTitle?: string) => {
    setUrl(linkUrl)
    setTitle(linkTitle || '')
    try {
      await openEasnerInAppBrowser(linkUrl)
      setIsVisible(false)
    } catch {
      // Fallback to in-app modal WebView when native browser fails.
      setIsVisible(true)
    }
  }, [])

  const closeLink = useCallback(() => {
    setIsVisible(false)
    // Reset after a short delay to allow modal animation to complete
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

