import type { Metadata } from "next"

export interface BusinessPageMetadata {
  title: string
  description: string
  keywords?: string[]
}

export interface BusinessMetadataInput {
  metadata: BusinessPageMetadata
  path: string
  titleAbsolute?: string
  /** Override root `metadataBase` (pay/invoice public hosts). */
  metadataBase?: string | URL
  /** Defaults to true – Business app is noindex by product policy. */
  noIndex?: boolean
}

export function businessMetadata({
  metadata,
  path,
  titleAbsolute,
  metadataBase,
  noIndex = true,
}: BusinessMetadataInput): Metadata {
  // Absolute titles – brand lives in the page string (`… | Easner Business Banking`).
  const ogTitle = titleAbsolute ?? metadata.title
  const title = { absolute: ogTitle }

  return {
    title,
    description: metadata.description,
    keywords: metadata.keywords,
    applicationName: "Easner Business Banking",
    ...(metadataBase ? { metadataBase: new URL(metadataBase) } : {}),
    alternates: { canonical: path },
    openGraph: {
      title: ogTitle,
      description: metadata.description,
      url: path,
      type: "website",
      siteName: "Easner Business Banking",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      site: "@easnerbanking",
      title: ogTitle,
      description: metadata.description,
      creator: "@easnerbanking",
    },
    ...(noIndex
      ? {
          robots: {
            index: false,
            follow: false,
          },
        }
      : {}),
  }
}
